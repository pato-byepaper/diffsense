data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  name      = "diffwise-${var.environment}"
  account   = data.aws_caller_identity.current.account_id
  partition = data.aws_partition.current.partition

  # ------------------------------------------------------------------
  # Deployment presets. Anything set in .env overrides the preset value.
  # ------------------------------------------------------------------
  presets = {
    # As cheap as possible: no VPC endpoints, no NAT, no EC2, no WAF, no customer KMS key.
    # The database pauses after 5 idle minutes, so an idle month costs about 1-2 USD.
    small = {
      worker_runtime        = "lambda"
      worker_min            = 0
      worker_max            = 2
      worker_instance_type  = null
      db_min_acu            = 0
      db_max_acu            = 2
      db_multi_az           = false
      db_backup_days        = 1
      use_cmk               = false
      enable_waf            = false
      vpc_endpoints         = false
      detailed_monitoring   = false
      log_retention_days    = 7
      report_retention_days = 14
      maintenance_schedule  = "rate(1 day)"
    }
    # Production layout from the design doc: EC2 workers in private subnets with no internet
    # route (unless Gemini needs a NAT), a database that never pauses, failover, WAF, CMK.
    full = {
      worker_runtime        = "ec2"
      worker_min            = 1
      worker_max            = 10
      worker_instance_type  = "c7g.large"
      db_min_acu            = 0.5
      db_max_acu            = 8
      db_multi_az           = true
      db_backup_days        = 7
      use_cmk               = true
      enable_waf            = true
      vpc_endpoints         = true
      detailed_monitoring   = true
      log_retention_days    = 30
      report_retention_days = 30
      maintenance_schedule  = "rate(1 hour)"
    }
  }

  p = local.presets[var.deployment]

  worker_runtime        = local.p.worker_runtime
  worker_min            = coalesce(var.worker_min, local.p.worker_min)
  worker_max            = coalesce(var.worker_max, local.p.worker_max)
  worker_instance_type  = var.worker_instance_type != null ? var.worker_instance_type : local.p.worker_instance_type
  db_min_acu            = coalesce(var.db_min_acu, local.p.db_min_acu)
  db_max_acu            = coalesce(var.db_max_acu, local.p.db_max_acu)
  db_multi_az           = coalesce(var.db_multi_az, local.p.db_multi_az)
  enable_waf            = coalesce(var.enable_waf, local.p.enable_waf)
  report_retention_days = coalesce(var.report_retention_days, local.p.report_retention_days)

  use_gemini  = var.llm_provider == "gemini"
  use_bedrock = var.llm_provider == "bedrock"

  # Interface endpoints only matter for EC2 workers in private subnets (full).
  interface_endpoints = local.p.vpc_endpoints ? concat(
    ["sqs", "ssm", "ssmmessages", "ec2messages", "logs", "rds-data"],
    local.use_bedrock ? ["bedrock-runtime"] : []
  ) : []

  # The worker visibility timeout must exceed the longest job (Lambda max is 15 minutes).
  visibility_timeout_seconds = 960

  service_zip_hash = filebase64sha256(var.service_zip_path)
}

# ----------------------------------------------------------------------
# Foundation
# ----------------------------------------------------------------------

module "network" {
  source = "./modules/network"

  name                = local.name
  region              = var.aws_region
  interface_endpoints = local.interface_endpoints
  s3_gateway_endpoint = local.worker_runtime == "ec2"
  # EC2 workers need an internet route only to reach the Gemini API.
  enable_nat = local.worker_runtime == "ec2" && local.use_gemini
}

module "core" {
  source = "./modules/core"

  name                       = local.name
  region                     = var.aws_region
  account_id                 = local.account
  partition                  = local.partition
  use_cmk                    = local.p.use_cmk
  report_retention_days      = local.report_retention_days
  visibility_timeout_seconds = local.visibility_timeout_seconds
  create_gemini_parameter    = local.use_gemini
}

module "database" {
  source = "./modules/database"

  name                  = local.name
  vpc_id                = module.network.vpc_id
  subnet_ids            = module.network.private_subnet_ids
  kms_key_arn           = module.core.kms_key_arn
  min_acu               = local.db_min_acu
  max_acu               = local.db_max_acu
  reader_count          = local.db_multi_az ? 1 : 0
  backup_retention_days = local.p.db_backup_days
}

# ----------------------------------------------------------------------
# Shared configuration and permissions for the service code
# ----------------------------------------------------------------------

locals {
  service_env = {
    DIFFWISE_ENVIRONMENT           = var.environment
    DIFFWISE_DEPLOYMENT            = var.deployment
    DIFFWISE_QUEUE_URL             = module.core.queue_url
    DIFFWISE_REPORTS_BUCKET        = module.core.reports_bucket
    DIFFWISE_REPORT_RETENTION_DAYS = tostring(local.report_retention_days)
    DIFFWISE_DB_CLUSTER_ARN        = module.database.cluster_arn
    DIFFWISE_DB_SECRET_ARN         = module.database.secret_arn
    DIFFWISE_DB_NAME               = module.database.database_name
    DIFFWISE_ALLOWED_GITHUB_ORGS   = join(",", var.allowed_github_orgs)
    DIFFWISE_OIDC_AUDIENCE         = "diffwise"
    DIFFWISE_LLM_PROVIDER          = var.llm_provider
    DIFFWISE_BEDROCK_MODEL_ID      = var.bedrock_model_id
    DIFFWISE_GEMINI_KEY_PARAMETER  = module.core.gemini_parameter_name
    GEMINI_MODEL                   = var.gemini_model
    NODE_OPTIONS                   = "--enable-source-maps"
  }
}

# Database through the RDS Data API (HTTPS, pooled by AWS). Used by every component.
data "aws_iam_policy_document" "db" {
  statement {
    sid = "DataApi"
    actions = [
      "rds-data:ExecuteStatement",
      "rds-data:BatchExecuteStatement",
      "rds-data:BeginTransaction",
      "rds-data:CommitTransaction",
      "rds-data:RollbackTransaction",
    ]
    resources = [module.database.cluster_arn]
  }
  statement {
    sid       = "DbSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [module.database.secret_arn]
  }
  dynamic "statement" {
    for_each = local.p.use_cmk ? [1] : []
    content {
      sid       = "StackKey"
      actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
      resources = [module.core.kms_key_arn]
    }
  }
}

data "aws_iam_policy_document" "api" {
  source_policy_documents = [data.aws_iam_policy_document.db.json]

  statement {
    sid       = "Enqueue"
    actions   = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
    resources = [module.core.queue_arn]
  }
  statement {
    sid       = "ReadReports"
    actions   = ["s3:GetObject"]
    resources = ["${module.core.reports_bucket_arn}/reports/*"]
  }
}

data "aws_iam_policy_document" "worker" {
  source_policy_documents = [data.aws_iam_policy_document.db.json]

  statement {
    sid       = "ConsumeQueue"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"]
    resources = [module.core.queue_arn]
  }
  statement {
    sid       = "WriteReports"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${module.core.reports_bucket_arn}/reports/*"]
  }
  dynamic "statement" {
    for_each = local.use_bedrock ? [1] : []
    content {
      sid     = "Bedrock"
      actions = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
      resources = [
        "arn:${local.partition}:bedrock:*::foundation-model/*",
        "arn:${local.partition}:bedrock:*:${local.account}:inference-profile/*",
      ]
    }
  }
  dynamic "statement" {
    for_each = local.use_gemini ? [1] : []
    content {
      sid       = "GeminiKey"
      actions   = ["ssm:GetParameter"]
      resources = [module.core.gemini_parameter_arn]
    }
  }
}

data "aws_iam_policy_document" "maintenance" {
  source_policy_documents = [data.aws_iam_policy_document.db.json]

  statement {
    sid       = "ListReports"
    actions   = ["s3:ListBucket"]
    resources = [module.core.reports_bucket_arn]
  }
  statement {
    sid       = "PurgeReports"
    actions   = ["s3:DeleteObject"]
    resources = ["${module.core.reports_bucket_arn}/reports/*"]
  }
}

# ----------------------------------------------------------------------
# Compute
# ----------------------------------------------------------------------

module "api" {
  source = "./modules/api"

  name               = local.name
  zip_path           = var.service_zip_path
  zip_hash           = local.service_zip_hash
  env                = local.service_env
  policy_json        = data.aws_iam_policy_document.api.json
  partition          = local.partition
  kms_key_arn        = module.core.kms_key_arn
  log_retention_days = local.p.log_retention_days
  enable_waf         = local.enable_waf
}

module "workers_lambda" {
  source = "./modules/workers_lambda"
  count  = local.worker_runtime == "lambda" ? 1 : 0

  name               = local.name
  zip_path           = var.service_zip_path
  zip_hash           = local.service_zip_hash
  env                = local.service_env
  policy_json        = data.aws_iam_policy_document.worker.json
  partition          = local.partition
  kms_key_arn        = module.core.kms_key_arn
  log_retention_days = local.p.log_retention_days
  queue_arn          = module.core.queue_arn
  max_concurrency    = local.worker_max
}

module "workers_ec2" {
  source = "./modules/workers_ec2"
  count  = local.worker_runtime == "ec2" ? 1 : 0

  name               = local.name
  region             = var.aws_region
  partition          = local.partition
  vpc_id             = module.network.vpc_id
  subnet_ids         = module.network.private_subnet_ids
  instance_type      = local.worker_instance_type
  min_size           = local.worker_min
  max_size           = local.worker_max
  jobs_per_instance  = 4
  zip_path           = var.service_zip_path
  artifact_bucket    = module.core.reports_bucket
  env                = local.service_env
  policy_json        = data.aws_iam_policy_document.worker.json
  kms_key_arn        = module.core.kms_key_arn
  log_retention_days = local.p.log_retention_days
  queue_name         = module.core.queue_name
}

module "maintenance" {
  source = "./modules/maintenance"

  name                = local.name
  zip_path            = var.service_zip_path
  zip_hash            = local.service_zip_hash
  env                 = local.service_env
  policy_json         = data.aws_iam_policy_document.maintenance.json
  partition           = local.partition
  kms_key_arn         = module.core.kms_key_arn
  log_retention_days  = local.p.log_retention_days
  schedule_expression = local.p.maintenance_schedule
}

module "observability" {
  source = "./modules/observability"

  name                 = local.name
  region               = var.aws_region
  kms_key_arn          = module.core.kms_key_arn
  alarm_email          = var.alarm_email
  detailed             = local.p.detailed_monitoring
  queue_name           = module.core.queue_name
  dlq_name             = module.core.dlq_name
  api_function_name    = module.api.function_name
  api_name             = module.api.rest_api_name
  api_stage            = module.api.stage_name
  worker_function_name = local.worker_runtime == "lambda" ? module.workers_lambda[0].function_name : ""
  worker_asg_name      = local.worker_runtime == "ec2" ? module.workers_ec2[0].asg_name : ""
  db_cluster_id        = module.database.cluster_id
}
