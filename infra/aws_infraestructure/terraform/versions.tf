terraform {
  # 1.10+ for S3-native state locking (use_lockfile), 1.9+ for cross-variable validation.
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.80, < 7.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Filled in by deploy.sh with -backend-config (bucket, key, region, use_lockfile, encrypt).
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      app         = "diffwise"
      environment = var.environment
      deployment  = var.deployment
      managed-by  = "terraform"
    }
  }
}
