terraform {
  # 1.11+: argumentos write-only y recursos ephemeral (los secretos no tocan el state).
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }

  # State en el bucket de la cuenta de prod (lo crea bootstrap/), con lock nativo de S3.
  # Los datos del bucket van en backend.hcl: terraform init -backend-config=backend.hcl
  backend "s3" {}
}

provider "aws" {
  region              = "sa-east-1"
  allowed_account_ids = [var.account_id]
  default_tags {
    tags = { Project = "nutreitor", Environment = "prod", ManagedBy = "terraform" }
  }
}

# Certificados de CloudFront (sólo existen en us-east-1).
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = [var.account_id]
  default_tags {
    tags = { Project = "nutreitor", Environment = "prod", ManagedBy = "terraform" }
  }
}
