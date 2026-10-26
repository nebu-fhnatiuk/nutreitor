# Un entorno completo de Nutreitor (ADR 0047). staging y prod llaman a este módulo con
# tamaños distintos; la topología es la misma.

terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.us_east_1]
    }
    random = {
      source = "hashicorp/random"
    }
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  region     = data.aws_region.current.region
  account_id = data.aws_caller_identity.current.account_id
  root_url   = "https://${var.root_domain}"
  org_url    = "https://{slug}.${var.root_domain}"
}

# ── KMS ───────────────────────────────────────────────────────────────────────

# Una llave del entorno para RDS, ElastiCache, Secrets Manager, ECR y los logs.
resource "aws_kms_key" "this" {
  description         = "${var.name}: datos, secretos y logs"
  enable_key_rotation = true
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "Account"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${local.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "CloudWatchLogs"
        Effect    = "Allow"
        Principal = { Service = "logs.${local.region}.amazonaws.com" }
        Action    = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
        Condition = {
          ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${local.region}:${local.account_id}:log-group:*" }
        }
      },
    ]
  })
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.name}"
  target_key_id = aws_kms_key.this.key_id
}

# ── Red ───────────────────────────────────────────────────────────────────────

module "network" {
  source     = "../network"
  name       = var.name
  cidr       = var.vpc_cidr
  azs        = var.azs
  nat_per_az = var.nat_per_az
}

# ── Security groups ───────────────────────────────────────────────────────────

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "this" {
  for_each    = toset(["alb", "web", "api", "agents", "worker", "migrate", "db", "redis"])
  name        = "${var.name}-${each.key}"
  description = "${var.name} ${each.key}"
  vpc_id      = module.network.vpc_id
}

locals {
  sg = { for k, v in aws_security_group.this : k => v.id }

  # Quién entra a quién. Todo lo demás está cerrado.
  ingress = {
    web_from_alb      = { sg = "web", port = 3000, from = "alb" }
    api_from_web      = { sg = "api", port = 3001, from = "web" }
    agents_from_api   = { sg = "agents", port = 8000, from = "api" }
    db_from_api       = { sg = "db", port = 5432, from = "api" }
    db_from_worker    = { sg = "db", port = 5432, from = "worker" }
    db_from_agents    = { sg = "db", port = 5432, from = "agents" }
    db_from_migrate   = { sg = "db", port = 5432, from = "migrate" }
    redis_from_api    = { sg = "redis", port = 6379, from = "api" }
    redis_from_worker = { sg = "redis", port = 6379, from = "worker" }
  }
}

# El ALB sólo atiende a CloudFront.
resource "aws_vpc_security_group_ingress_rule" "alb_from_cloudfront" {
  security_group_id = local.sg.alb
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_ingress_rule" "this" {
  for_each                     = local.ingress
  security_group_id            = local.sg[each.value.sg]
  referenced_security_group_id = local.sg[each.value.from]
  ip_protocol                  = "tcp"
  from_port                    = each.value.port
  to_port                      = each.value.port
}

resource "aws_vpc_security_group_egress_rule" "alb_to_web" {
  security_group_id            = local.sg.alb
  referenced_security_group_id = local.sg.web
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
}

# Las tareas salen a internet por el NAT (ECR, Secrets Manager, SES, Bedrock) y a sus
# dependencias internas. RDS y Redis no salen a ningún lado.
resource "aws_vpc_security_group_egress_rule" "tasks" {
  for_each          = toset(["web", "api", "agents", "worker", "migrate"])
  security_group_id = local.sg[each.key]
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ── Datos ─────────────────────────────────────────────────────────────────────

# Contraseñas efímeras: se generan en cada plan, pero sólo se escriben (en RDS y en
# Secrets Manager, con argumentos write-only) cuando cambia credentials_version.
# Nunca quedan en el state ni en el repo.
ephemeral "random_password" "db" {
  for_each = toset(["owner", "app", "worker", "agents"])
  length   = 40
  special  = false
}

locals {
  app_secret_names = toset(["jwt_access", "jwt_refresh", "edge", "agents"])
}

ephemeral "random_password" "app" {
  for_each = local.app_secret_names
  length   = 64
  special  = false
}

module "data" {
  source                      = "../data"
  name                        = var.name
  subnet_ids                  = module.network.data_subnet_ids
  db_security_group_id        = local.sg.db
  redis_security_group_id     = local.sg.redis
  kms_key_arn                 = aws_kms_key.this.arn
  db_instance_class           = var.db_instance_class
  db_allocated_storage_gb     = var.db_allocated_storage_gb
  db_max_allocated_storage_gb = var.db_max_allocated_storage_gb
  db_multi_az                 = var.db_multi_az
  db_backup_retention_days    = var.db_backup_retention_days
  deletion_protection         = var.deletion_protection
  owner_password              = ephemeral.random_password.db["owner"].result
  credentials_version         = var.credentials_version
  redis_node_type             = var.redis_node_type
  redis_replicas              = var.redis_replicas
}

# ── Secretos ──────────────────────────────────────────────────────────────────

locals {
  db_roles = {
    owner  = "nutreitor_owner"
    app    = "nutreitor_app"
    worker = "nutreitor_worker"
    agents = "nutreitor_agents"
  }
  # verify-full: el certificado de RDS se valida contra la CA que traen las imágenes.
  db_params = "sslmode=verify-full&sslrootcert=/etc/ssl/rds-global-bundle.pem"
}

resource "aws_secretsmanager_secret" "db" {
  for_each                = local.db_roles
  name                    = "${var.name}/db/${each.key}-url"
  kms_key_id              = aws_kms_key.this.arn
  recovery_window_in_days = var.deletion_protection ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "db" {
  for_each                 = local.db_roles
  secret_id                = aws_secretsmanager_secret.db[each.key].id
  secret_string_wo         = "postgresql://${each.value}:${ephemeral.random_password.db[each.key].result}@${module.data.db_address}:${module.data.db_port}/nutreitor?${local.db_params}"
  secret_string_wo_version = var.credentials_version
}

resource "aws_secretsmanager_secret" "app" {
  for_each                = local.app_secret_names
  name                    = "${var.name}/app/${each.key}"
  kms_key_id              = aws_kms_key.this.arn
  recovery_window_in_days = var.deletion_protection ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "app" {
  for_each                 = local.app_secret_names
  secret_id                = aws_secretsmanager_secret.app[each.key].id
  secret_string_wo         = ephemeral.random_password.app[each.key].result
  secret_string_wo_version = var.app_secrets_version
}

locals {
  db_secret  = { for k, s in aws_secretsmanager_secret.db : k => s.arn }
  app_secret = { for k, s in aws_secretsmanager_secret.app : k => s.arn }
}

# ── Borde ─────────────────────────────────────────────────────────────────────

module "edge" {
  source = "../edge"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }
  name                  = var.name
  root_domain           = var.root_domain
  zone_id               = var.zone_id
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  alb_security_group_id = local.sg.alb
  deletion_protection   = var.deletion_protection
}

# ── Servicios ─────────────────────────────────────────────────────────────────

module "ecs" {
  source               = "../ecs"
  name                 = var.name
  region               = local.region
  private_subnet_ids   = module.network.private_subnet_ids
  security_group_ids   = local.sg
  web_target_group_arn = module.edge.web_target_group_arn
  kms_key_arn          = aws_kms_key.this.arn
  image_tag            = var.image_tag
  use_spot             = var.use_spot
  container_insights   = var.container_insights
  log_retention_days   = var.log_retention_days
  services             = var.services
  bedrock_enabled      = var.bedrock_enabled
  bedrock_region       = var.bedrock_region
  bedrock_model_ids    = var.bedrock_model_ids
  ses_identity_arns    = var.ses_identity_arns

  environment = {
    web = {
      NODE_ENV         = "production"
      PORT             = "3000"
      HOSTNAME         = "0.0.0.0"
      API_INTERNAL_URL = "http://api:3001"
      ROOT_DOMAIN      = var.root_domain
      SITE_URL         = local.root_url
      # Cliente → CloudFront → ALB: la IP real es la penúltima de X-Forwarded-For.
      TRUSTED_PROXY_HOPS = "2"
    }
    api = {
      NODE_ENV                 = "production"
      API_PORT                 = "3001"
      REDIS_URL                = module.data.redis_url
      ROOT_DOMAIN              = var.root_domain
      COOKIE_SECURE            = "true"
      WEB_ORIGIN_TEMPLATE      = local.org_url
      WEB_ROOT_ORIGIN          = local.root_url
      SITE_URL                 = local.root_url
      AGENTS_SERVICE_URL       = "http://agents:8000"
      AGENTS_RATELIMIT_PER_MIN = "30"
      AGENTS_MONTHLY_TOKEN_CAP = tostring(var.agents_monthly_token_cap)
    }
    worker = {
      NODE_ENV         = "production"
      REDIS_URL        = module.data.redis_url
      WEB_URL_TEMPLATE = local.org_url
      MAIL_PROVIDER    = var.mail_provider
      MAIL_FROM        = "avisos@${var.root_domain}"
      AWS_REGION       = local.region
      SCAN_EVERY_MS    = "60000"
    }
    agents = {
      INFERENCE_PROVIDER       = var.bedrock_enabled ? "bedrock" : "stub"
      BEDROCK_MODEL_ID         = length(var.bedrock_model_ids) > 0 ? var.bedrock_model_ids[0] : ""
      BEDROCK_REGION           = var.bedrock_region
      AGENTS_RATELIMIT_PER_MIN = "30"
      AGENTS_MONTHLY_TOKEN_CAP = tostring(var.agents_monthly_token_cap)
    }
    migrate = {
      NODE_ENV = "production"
    }
  }

  secrets = {
    web = {
      EDGE_SHARED_SECRET = local.app_secret.edge
    }
    api = {
      DATABASE_URL         = local.db_secret.app
      DATABASE_OWNER_URL   = local.db_secret.owner
      JWT_ACCESS_SECRET    = local.app_secret.jwt_access
      JWT_REFRESH_SECRET   = local.app_secret.jwt_refresh
      EDGE_SHARED_SECRET   = local.app_secret.edge
      AGENTS_SHARED_SECRET = local.app_secret.agents
    }
    worker = {
      DATABASE_WORKER_URL = local.db_secret.worker
    }
    agents = {
      DATABASE_AGENTS_URL  = local.db_secret.agents
      AGENTS_SHARED_SECRET = local.app_secret.agents
    }
    # Migra con owner y fija la contraseña de cada rol desde su URL.
    migrate = {
      DATABASE_OWNER_URL  = local.db_secret.owner
      DATABASE_URL        = local.db_secret.app
      DATABASE_WORKER_URL = local.db_secret.worker
      DATABASE_AGENTS_URL = local.db_secret.agents
    }
  }
}
