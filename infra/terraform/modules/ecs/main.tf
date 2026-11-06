# ECS Fargate (ADR 0047): web detrás del ALB; api y agents internos por Service
# Connect (api:3001, agents:8000); worker sin puertos; migrate como tarea one-off.

variable "name" {
  type = string
}

variable "region" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "security_group_ids" {
  description = "Security group por servicio (web, api, agents, worker, migrate)."
  type        = map(string)
}

variable "web_target_group_arn" {
  type = string
}

variable "kms_key_arn" {
  type = string
}

variable "image_tag" {
  description = "Tag de las imágenes a desplegar (el SHA del commit)."
  type        = string
}

variable "use_spot" {
  description = "Fargate Spot para todo (staging)."
  type        = bool
}

variable "container_insights" {
  type = bool
}

variable "log_retention_days" {
  type = number
}

variable "services" {
  description = "Tamaño por servicio: cpu, memory, desired, min y max (autoscaling por CPU si max > min)."
  type = map(object({
    cpu     = number
    memory  = number
    desired = number
    min     = number
    max     = number
  }))
}

variable "environment" {
  description = "Variables de entorno (no secretas) por servicio."
  type        = map(map(string))
}

variable "secrets" {
  description = "Variable → ARN del secreto, por servicio (y para migrate)."
  type        = map(map(string))
}

variable "bedrock_enabled" {
  description = "Permite a agents invocar Bedrock (KAN-52). Apagado: ni el permiso existe."
  type        = bool
}

variable "bedrock_region" {
  type = string
}

variable "bedrock_model_ids" {
  description = "Modelos (o perfiles de inferencia) que agents puede invocar."
  type        = list(string)
}

variable "ses_identity_arns" {
  description = "Identidades de SES desde las que el worker puede mandar (KAN-17). Vacío: sin permiso."
  type        = list(string)
}

locals {
  repos = ["api", "web", "worker", "agents"]

  # Puerto que publica cada servicio (web lo usa el ALB; api y agents, Service Connect).
  ports = { web = 3000, api = 3001, agents = 8000 }

  # Qué imagen corre cada tarea. migrate usa la de la API (trae packages/db).
  images = {
    web     = "web"
    api     = "api"
    agents  = "agents"
    worker  = "worker"
    migrate = "api"
  }

  commands = {
    migrate = ["sh", "-c", "node /app/packages/db/dist/migrate.js && node /app/packages/db/dist/set-role-passwords.js"]
  }

  health = {
    api    = ["CMD", "node", "-e", "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
    agents = ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"]
  }

  tasks = merge(var.services, { migrate = { cpu = 512, memory = 1024, desired = 0, min = 0, max = 0 } })
}

# ── Imágenes ──────────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "this" {
  for_each             = toset(local.repos)
  name                 = "${var.name}/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = var.kms_key_arn
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each   = aws_ecr_repository.this
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Quedarse con las últimas 30 imágenes"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
  })
}

# ── Cluster ───────────────────────────────────────────────────────────────────

resource "aws_service_discovery_http_namespace" "this" {
  name = "${var.name}.internal"
}

resource "aws_ecs_cluster" "this" {
  name = var.name
  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }
  service_connect_defaults {
    namespace = aws_service_discovery_http_namespace.this.arn
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  default_capacity_provider_strategy {
    capacity_provider = var.use_spot ? "FARGATE_SPOT" : "FARGATE"
    weight            = 1
  }
}

resource "aws_cloudwatch_log_group" "this" {
  for_each          = local.tasks
  name              = "/ecs/${var.name}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

# ── IAM ───────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Ejecución: bajar la imagen, escribir logs y leer SÓLO los secretos de esa tarea.
resource "aws_iam_role" "execution" {
  for_each           = local.tasks
  name               = "${var.name}-${each.key}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  for_each   = local.tasks
  role       = aws_iam_role.execution[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  for_each = { for k, v in var.secrets : k => v if length(v) > 0 }
  name     = "secrets"
  role     = aws_iam_role.execution[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = "secretsmanager:GetSecretValue", Resource = distinct(values(each.value)) },
      { Effect = "Allow", Action = "kms:Decrypt", Resource = var.kms_key_arn },
    ]
  })
}

# Tarea: lo que el código puede hacer en AWS. Por defecto, nada.
resource "aws_iam_role" "task" {
  for_each           = local.tasks
  name               = "${var.name}-${each.key}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_caller_identity" "current" {}

# Bedrock, sólo agents y sólo los modelos listados, en la región de Bedrock (ADR 0048).
resource "aws_iam_role_policy" "agents_bedrock" {
  count = var.bedrock_enabled ? 1 : 0
  name  = "bedrock"
  role  = aws_iam_role.task["agents"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "bedrock:InvokeModel" # también cubre Converse
      # Un perfil de inferencia "us." puede correr el modelo en cualquier región de EE.UU.:
      # hace falta permiso sobre el perfil y sobre el modelo en esas regiones.
      Resource = flatten([for m in var.bedrock_model_ids : startswith(m, "us.") ? [
        "arn:aws:bedrock:${var.bedrock_region}:${data.aws_caller_identity.current.account_id}:inference-profile/${m}",
        "arn:aws:bedrock:us-*::foundation-model/${trimprefix(m, "us.")}",
      ] : ["arn:aws:bedrock:${var.bedrock_region}::foundation-model/${m}"]])
    }]
  })
}

resource "aws_iam_role_policy" "worker_ses" {
  count = length(var.ses_identity_arns) > 0 ? 1 : 0
  name  = "ses"
  role  = aws_iam_role.task["worker"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = var.ses_identity_arns
    }]
  })
}

# ── Tareas ────────────────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "this" {
  for_each                 = local.tasks
  family                   = "${var.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.execution[each.key].arn
  task_role_arn            = aws_iam_role.task[each.key].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([merge(
    {
      name        = each.key
      image       = "${aws_ecr_repository.this[local.images[each.key]].repository_url}:${var.image_tag}"
      essential   = true
      environment = [for k, v in lookup(var.environment, each.key, {}) : { name = k, value = v }]
      secrets     = [for k, v in lookup(var.secrets, each.key, {}) : { name = k, valueFrom = v }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.this[each.key].name
          awslogs-region        = var.region
          awslogs-stream-prefix = each.key
        }
      }
      portMappings = contains(keys(local.ports), each.key) ? [{
        name          = each.key
        containerPort = local.ports[each.key]
        protocol      = "tcp"
        appProtocol   = "http"
      }] : []
    },
    contains(keys(local.commands), each.key) ? { command = local.commands[each.key] } : {},
    contains(keys(local.health), each.key) ? {
      healthCheck = { command = local.health[each.key], interval = 15, timeout = 5, retries = 3, startPeriod = 30 }
    } : {},
  )])
}

# ── Servicios ─────────────────────────────────────────────────────────────────

# Service Connect arma el proxy de cada tarea con los nombres que existen en el
# namespace cuando la tarea arranca: si web arranca antes de que api publique el suyo,
# falla con `getaddrinfo ENOTFOUND api` hasta que se la redeploya (primer apply de
# staging, 2026-11-06). Por eso los servicios se crean en escalones, cada uno después
# del anterior: agents (servidor de api), api (servidor de web) y los clientes puros.
locals {
  publishers = ["api", "agents"]

  service_tiers = {
    agents  = { for k, v in var.services : k => v if k == "agents" }
    api     = { for k, v in var.services : k => v if k == "api" }
    clients = { for k, v in var.services : k => v if !contains(["agents", "api"], k) }
  }

  service_common = {
    cluster_id           = aws_ecs_cluster.this.id
    namespace_arn        = aws_service_discovery_http_namespace.this.arn
    task_definition_arns = { for k, t in aws_ecs_task_definition.this : k => t.arn }
  }
}

module "service_agents" {
  source               = "./service"
  services             = local.service_tiers.agents
  cluster_id           = local.service_common.cluster_id
  namespace_arn        = local.service_common.namespace_arn
  task_definition_arns = local.service_common.task_definition_arns
  use_spot             = var.use_spot
  private_subnet_ids   = var.private_subnet_ids
  security_group_ids   = var.security_group_ids
  web_target_group_arn = var.web_target_group_arn
  ports                = local.ports
  publishers           = local.publishers

  depends_on = [aws_ecs_cluster_capacity_providers.this]
}

module "service_api" {
  source               = "./service"
  services             = local.service_tiers.api
  cluster_id           = local.service_common.cluster_id
  namespace_arn        = local.service_common.namespace_arn
  task_definition_arns = local.service_common.task_definition_arns
  use_spot             = var.use_spot
  private_subnet_ids   = var.private_subnet_ids
  security_group_ids   = var.security_group_ids
  web_target_group_arn = var.web_target_group_arn
  ports                = local.ports
  publishers           = local.publishers

  depends_on = [module.service_agents]
}

module "service_clients" {
  source               = "./service"
  services             = local.service_tiers.clients
  cluster_id           = local.service_common.cluster_id
  namespace_arn        = local.service_common.namespace_arn
  task_definition_arns = local.service_common.task_definition_arns
  use_spot             = var.use_spot
  private_subnet_ids   = var.private_subnet_ids
  security_group_ids   = var.security_group_ids
  web_target_group_arn = var.web_target_group_arn
  ports                = local.ports
  publishers           = local.publishers

  depends_on = [module.service_api]
}

# Los servicios ya creados en staging pasan a los submódulos sin recrearse.
moved {
  from = aws_ecs_service.this["agents"]
  to   = module.service_agents.aws_ecs_service.this["agents"]
}

moved {
  from = aws_ecs_service.this["api"]
  to   = module.service_api.aws_ecs_service.this["api"]
}

moved {
  from = aws_ecs_service.this["web"]
  to   = module.service_clients.aws_ecs_service.this["web"]
}

moved {
  from = aws_ecs_service.this["worker"]
  to   = module.service_clients.aws_ecs_service.this["worker"]
}

locals {
  service_names = merge(
    module.service_agents.names,
    module.service_api.names,
    module.service_clients.names,
  )
}

resource "aws_appautoscaling_target" "this" {
  for_each           = { for k, v in var.services : k => v if v.max > v.min }
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${local.service_names[each.key]}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = each.value.min
  max_capacity       = each.value.max
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each           = aws_appautoscaling_target.this
  name               = "${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = each.value.service_namespace
  resource_id        = each.value.resource_id
  scalable_dimension = each.value.scalable_dimension
  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "ecr_repository_urls" {
  value = { for k, r in aws_ecr_repository.this : k => r.repository_url }
}

output "migrate_task_definition" {
  value = aws_ecs_task_definition.this["migrate"].family
}
