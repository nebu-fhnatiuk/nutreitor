# Bootstrap de una cuenta (ADR 0047): el bucket del state y el rol que asume GitHub
# Actions por OIDC. Se corre una vez por cuenta, con credenciales de administrador:
#
#   terraform init && terraform apply -var env=staging -var account_id=...
#
# Después el state de este directorio se puede mover a su propio bucket con
# `terraform init -migrate-state` (ver infra/terraform/README.md).

terraform {
  required_version = ">= 1.11"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "env" {
  type = string
  validation {
    condition     = contains(["staging", "prod"], var.env)
    error_message = "env es staging o prod."
  }
}

variable "account_id" {
  type = string
}

variable "github_repository" {
  description = "owner/repo que puede desplegar."
  type        = string
  default     = "nebu-fhnatiuk/nutreitor"
}

variable "create_service_linked_roles" {
  description = <<-EOT
    Crea los roles vinculados de ECS y ElastiCache. Sólo en una cuenta donde todavía
    no existen (si ya existen, el apply falla). Ver infra/terraform/README.md.
  EOT
  type        = bool
  default     = false
}

provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = [var.account_id]
  default_tags {
    tags = { Project = "nutreitor", Environment = var.env, ManagedBy = "terraform" }
  }
}

# ── State ─────────────────────────────────────────────────────────────────────

resource "aws_kms_key" "state" {
  description         = "nutreitor-${var.env}: state de Terraform"
  enable_key_rotation = true
}

resource "aws_kms_alias" "state" {
  name          = "alias/nutreitor-${var.env}-tfstate"
  target_key_id = aws_kms_key.state.key_id
}

resource "aws_s3_bucket" "state" {
  bucket = "nutreitor-${var.env}-tfstate"
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "OnlyTLS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# Versiones viejas del state: 90 días alcanzan para volver atrás.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# ── Roles vinculados a servicios ──────────────────────────────────────────────

# En una cuenta nueva, el primer apply del entorno crea estos roles al vuelo y los
# usa antes de que IAM los propague: ECS falla con "Service Linked Role is not ready"
# y ElastiCache con "InvalidCredentialsException" (staging, 2026-11-06). Creándolos
# en el bootstrap ya están listos cuando corre el entorno.
resource "aws_iam_service_linked_role" "this" {
  for_each         = var.create_service_linked_roles ? toset(["ecs.amazonaws.com", "elasticache.amazonaws.com"]) : toset([])
  aws_service_name = each.key
}

# ── Deploy desde GitHub (OIDC, sin llaves de larga duración) ──────────────────

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

# Sólo los jobs del environment de GitHub con el mismo nombre (staging o prod), que
# pueden exigir aprobación manual, asumen el rol.
resource "aws_iam_role" "deploy" {
  name = "nutreitor-${var.env}-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:${var.env}"
        }
      }
    }]
  })
}

# Terraform administra VPC, IAM, KMS, RDS, etc.: necesita permisos amplios en la
# cuenta del entorno. El límite está en la cuenta (una por entorno) y en el trust.
resource "aws_iam_role_policy_attachment" "deploy" {
  role       = aws_iam_role.deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}
