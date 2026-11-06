# Datos: Postgres 17 (RDS) y Redis 7 (ElastiCache) en las subnets de datos, cifrados
# con una KMS propia del entorno (ADR 0047).

variable "name" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "db_security_group_id" {
  type = string
}

variable "redis_security_group_id" {
  type = string
}

variable "kms_key_arn" {
  type = string
}

variable "db_instance_class" {
  type = string
}

variable "db_allocated_storage_gb" {
  type = number
}

variable "db_max_allocated_storage_gb" {
  type = number
}

variable "db_multi_az" {
  type = bool
}

variable "db_backup_retention_days" {
  type = number
}

variable "deletion_protection" {
  type = bool
}

variable "owner_password" {
  description = "Contraseña del rol owner (usuario maestro). Ephemeral: no queda en el state."
  type        = string
  sensitive   = true
  ephemeral   = true
}

variable "credentials_version" {
  description = "Subirlo rota la contraseña del owner (y los secretos que la contienen)."
  type        = number
}

variable "redis_node_type" {
  type = string
}

variable "redis_replicas" {
  description = "Réplicas además del primario (0 en staging)."
  type        = number
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-pg17"
  family = "postgres17"

  # Sin TLS no se conecta nadie. AWS lo guarda con apply_method = pending-reboot;
  # si no se fija igual acá, cada plan muestra un cambio in-place que nunca converge.
  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }

  # Consultas de más de 1 s al log (para encontrar lo lento sin loguear PHI de más).
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

resource "aws_db_instance" "this" {
  identifier     = var.name
  engine         = "postgres"
  engine_version = "17"
  instance_class = var.db_instance_class

  db_name  = "nutreitor"
  username = "nutreitor_owner"
  # Write-only: la contraseña llega efímera y no se guarda en el state.
  password_wo         = var.owner_password
  password_wo_version = var.credentials_version

  allocated_storage     = var.db_allocated_storage_gb
  max_allocated_storage = var.db_max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.db_security_group_id]
  parameter_group_name   = aws_db_parameter_group.this.name
  publicly_accessible    = false
  multi_az               = var.db_multi_az
  ca_cert_identifier     = "rds-ca-rsa2048-g1"

  backup_retention_period    = var.db_backup_retention_days
  backup_window              = "06:00-07:00" # 03:00-04:00 en Argentina
  maintenance_window         = "sun:07:00-sun:08:00"
  copy_tags_to_snapshot      = true
  auto_minor_version_upgrade = true
  deletion_protection        = var.deletion_protection
  skip_final_snapshot        = !var.deletion_protection
  final_snapshot_identifier  = var.deletion_protection ? "${var.name}-final" : null

  performance_insights_enabled    = true
  performance_insights_kms_key_id = var.kms_key_arn
  enabled_cloudwatch_logs_exports = ["postgresql"]
}

resource "aws_elasticache_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

# Rate limiting (ADR 0017) y la cola del worker (ADR 0023). Sin AUTH: lo cierra el
# security group; TLS en tránsito y cifrado en reposo.
resource "aws_elasticache_replication_group" "this" {
  replication_group_id = var.name
  description          = "Rate limiting y cola del worker"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_clusters   = 1 + var.redis_replicas
  port                 = 6379

  automatic_failover_enabled = var.redis_replicas > 0
  multi_az_enabled           = var.redis_replicas > 0

  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [var.redis_security_group_id]
  at_rest_encryption_enabled = true
  kms_key_id                 = var.kms_key_arn
  transit_encryption_enabled = true

  snapshot_retention_limit = 0 # efímero: contadores y jobs reintentables
  maintenance_window       = "sun:08:00-sun:09:00"
  apply_immediately        = false
}

output "db_address" {
  value = aws_db_instance.this.address
}

output "db_port" {
  value = aws_db_instance.this.port
}

output "redis_url" {
  value = "rediss://${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"
}
