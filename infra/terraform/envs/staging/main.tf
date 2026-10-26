# Staging (ADR 0047): misma topología que prod, chica. Una AZ de NAT, RDS single-AZ,
# Redis sin réplica, Fargate Spot y una tarea por servicio.

variable "account_id" {
  description = "Cuenta AWS de staging (el provider se niega a operar en otra)."
  type        = string
}

variable "zone_id" {
  description = "Hosted zone de staging.nutreitor.com (delegada desde la de prod)."
  type        = string
}

variable "image_tag" {
  type = string
}

module "stack" {
  source = "../../modules/stack"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name        = "nutreitor-staging"
  root_domain = "staging.nutreitor.com"
  zone_id     = var.zone_id

  vpc_cidr   = "10.20.0.0/16"
  azs        = ["sa-east-1a", "sa-east-1c"]
  nat_per_az = false

  db_instance_class           = "db.t4g.micro"
  db_allocated_storage_gb     = 20
  db_max_allocated_storage_gb = 50
  db_multi_az                 = false
  db_backup_retention_days    = 3
  redis_node_type             = "cache.t4g.micro"
  redis_replicas              = 0
  deletion_protection         = false

  image_tag          = var.image_tag
  use_spot           = true
  container_insights = false
  log_retention_days = 14

  services = {
    web    = { cpu = 256, memory = 512, desired = 1, min = 1, max = 1 }
    api    = { cpu = 512, memory = 1024, desired = 1, min = 1, max = 1 }
    agents = { cpu = 256, memory = 512, desired = 1, min = 1, max = 1 }
    worker = { cpu = 256, memory = 512, desired = 1, min = 1, max = 1 }
  }
}

output "stack" {
  value = module.stack
}
