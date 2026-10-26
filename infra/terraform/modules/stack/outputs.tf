output "cluster_name" {
  value = module.ecs.cluster_name
}

output "ecr_repository_urls" {
  value = module.ecs.ecr_repository_urls
}

output "migrate_task_definition" {
  value = module.ecs.migrate_task_definition
}

# Para `aws ecs run-task` de la migración (ver README).
output "migrate_network" {
  value = {
    subnets         = module.network.private_subnet_ids
    security_groups = [local.sg.migrate]
  }
}

output "site_bucket" {
  value = module.edge.site_bucket
}

output "site_distribution_id" {
  value = module.edge.root_distribution_id
}
