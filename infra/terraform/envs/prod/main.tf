# Producción (ADR 0048 y 0047): us-east-1, Multi-AZ, NAT por AZ y autoscaling por CPU
# en web y api.

variable "account_id" {
  description = "Cuenta AWS de prod (el provider se niega a operar en otra)."
  type        = string
}

variable "zone_id" {
  description = "Hosted zone de nutreitor.com."
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

  name        = "nutreitor-prod"
  root_domain = "nutreitor.com"
  zone_id     = var.zone_id

  vpc_cidr   = "10.30.0.0/16"
  azs        = ["us-east-1a", "us-east-1b"]
  nat_per_az = true

  db_instance_class           = "db.t4g.medium"
  db_allocated_storage_gb     = 50
  db_max_allocated_storage_gb = 200
  db_multi_az                 = true
  db_backup_retention_days    = 14
  redis_node_type             = "cache.t4g.small"
  redis_replicas              = 1
  deletion_protection         = true

  image_tag          = var.image_tag
  use_spot           = false
  container_insights = true
  log_retention_days = 90

  services = {
    web    = { cpu = 512, memory = 1024, desired = 2, min = 2, max = 6 }
    api    = { cpu = 1024, memory = 2048, desired = 2, min = 2, max = 6 }
    agents = { cpu = 512, memory = 1024, desired = 2, min = 2, max = 2 }
    worker = { cpu = 256, memory = 512, desired = 1, min = 1, max = 1 }
  }
}

output "stack" {
  value = module.stack
}
