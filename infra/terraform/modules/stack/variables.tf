variable "name" {
  description = "Prefijo de los recursos (nutreitor-staging, nutreitor-prod)."
  type        = string
}

variable "root_domain" {
  type = string
}

variable "zone_id" {
  description = "Hosted zone de Route 53 del dominio raíz, ya creada (ver infra/terraform/README.md)."
  type        = string
}

variable "vpc_cidr" {
  type = string
}

variable "azs" {
  type = list(string)
}

variable "nat_per_az" {
  type = bool
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

variable "redis_node_type" {
  type = string
}

variable "redis_replicas" {
  type = number
}

variable "deletion_protection" {
  description = "Protege RDS, el ALB y los secretos de un destroy accidental (prod)."
  type        = bool
}

variable "credentials_version" {
  description = "Versión de las contraseñas de la base. Subirla rota todas (ver README)."
  type        = number
  default     = 1
}

variable "app_secrets_version" {
  description = "Versión de los secretos de la app (JWT, edge, agents). Subirla los rota."
  type        = number
  default     = 1
}

variable "image_tag" {
  description = "Tag de las imágenes (SHA del commit) que corre cada servicio."
  type        = string
}

variable "use_spot" {
  type = bool
}

variable "container_insights" {
  type = bool
}

variable "log_retention_days" {
  type = number
}

variable "services" {
  type = map(object({
    cpu     = number
    memory  = number
    desired = number
    min     = number
    max     = number
  }))
  validation {
    condition     = toset(keys(var.services)) == toset(["web", "api", "agents", "worker"])
    error_message = "services tiene que definir web, api, agents y worker."
  }
}

variable "mail_provider" {
  description = "console hasta que SES esté verificado (KAN-17); después, ses."
  type        = string
  default     = "console"
  validation {
    condition     = contains(["console", "ses"], var.mail_provider)
    error_message = "mail_provider es console o ses."
  }
}

variable "ses_identity_arns" {
  type    = list(string)
  default = []
}

variable "bedrock_enabled" {
  description = "Apagado hasta el BAA y el consentimiento (KAN-52). Sin él, agents corre con el stub."
  type        = bool
  default     = false
}

variable "bedrock_region" {
  description = "Región de Bedrock (ADR 0048)."
  type        = string
  default     = "us-east-1"
}

variable "bedrock_model_ids" {
  type    = list(string)
  default = []
}

variable "agents_monthly_token_cap" {
  description = "Tope mensual de tokens por organización (0 = sin tope)."
  type        = number
  default     = 0
}
