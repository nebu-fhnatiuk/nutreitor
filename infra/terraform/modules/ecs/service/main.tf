# Servicios de ECS de un mismo "escalón" de Service Connect. El módulo ecs lo llama
# una vez por escalón (agents → api → web y worker) con depends_on entre llamadas:
# así cada cliente se crea después de que su servidor publicó el nombre.

variable "services" {
  description = "Servicios de este escalón: desired_count por servicio."
  type        = map(object({ desired = number }))
}

variable "cluster_id" {
  type = string
}

variable "namespace_arn" {
  type = string
}

variable "task_definition_arns" {
  type = map(string)
}

variable "use_spot" {
  type = bool
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "security_group_ids" {
  type = map(string)
}

variable "web_target_group_arn" {
  type = string
}

variable "ports" {
  description = "Puerto por servicio que publica su nombre en Service Connect (o detrás del ALB)."
  type        = map(number)
}

variable "publishers" {
  description = "Servicios que publican su nombre en Service Connect (los demás sólo consumen)."
  type        = list(string)
}

resource "aws_ecs_service" "this" {
  for_each        = var.services
  name            = each.key
  cluster         = var.cluster_id
  task_definition = var.task_definition_arns[each.key]
  desired_count   = each.value.desired

  capacity_provider_strategy {
    capacity_provider = var.use_spot ? "FARGATE_SPOT" : "FARGATE"
    weight            = 1
  }

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.security_group_ids[each.key]]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_execute_command             = false
  propagate_tags                     = "SERVICE"
  wait_for_steady_state              = false

  dynamic "load_balancer" {
    for_each = each.key == "web" ? [1] : []
    content {
      target_group_arn = var.web_target_group_arn
      container_name   = "web"
      container_port   = var.ports["web"]
    }
  }
  health_check_grace_period_seconds = each.key == "web" ? 60 : null

  service_connect_configuration {
    enabled   = true
    namespace = var.namespace_arn
    dynamic "service" {
      for_each = contains(var.publishers, each.key) ? [1] : []
      content {
        port_name = each.key
        client_alias {
          dns_name = each.key
          port     = var.ports[each.key]
        }
      }
    }
  }

  # El autoscaling mueve desired_count; Terraform no lo pisa en cada apply.
  lifecycle {
    ignore_changes = [desired_count]
  }
}

output "names" {
  value = { for k, s in aws_ecs_service.this : k => s.name }
}
