# KMS key (full only), reports bucket, analysis queue + DLQ, and the Gemini key parameter.
# small uses AWS-managed encryption everywhere (free) instead of a customer key (1 USD/month + requests).

variable "name" { type = string }
variable "region" { type = string }
variable "account_id" { type = string }
variable "partition" { type = string }
variable "use_cmk" { type = bool }
variable "report_retention_days" { type = number }
variable "visibility_timeout_seconds" { type = number }
variable "create_gemini_parameter" { type = bool }

# ---------------------------------------------------------------- KMS

data "aws_iam_policy_document" "kms" {
  count = var.use_cmk ? 1 : 0

  statement {
    sid       = "AccountAdmin"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${var.partition}:iam::${var.account_id}:root"]
    }
  }

  statement {
    sid       = "CloudWatchLogs"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${var.region}.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:${var.partition}:logs:${var.region}:${var.account_id}:log-group:*"]
    }
  }

  # CloudWatch alarms publishing to the encrypted SNS topic.
  statement {
    sid       = "CloudWatchAlarms"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
  }
}

resource "aws_kms_key" "this" {
  count                   = var.use_cmk ? 1 : 0
  description             = "${var.name} stack key"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms[0].json
}

resource "aws_kms_alias" "this" {
  count         = var.use_cmk ? 1 : 0
  name          = "alias/${var.name}"
  target_key_id = aws_kms_key.this[0].key_id
}

locals {
  kms_key_arn = var.use_cmk ? aws_kms_key.this[0].arn : null
}

# ---------------------------------------------------------------- S3

resource "aws_s3_bucket" "reports" {
  bucket = "${var.name}-reports-${var.account_id}"
  # Reports are disposable copies of PR comments; destroy must not get stuck on them.
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket                  = aws_s3_bucket.reports.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "reports" {
  bucket = aws_s3_bucket.reports.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.use_cmk ? "aws:kms" : "AES256"
      kms_master_key_id = local.kms_key_arn
    }
    bucket_key_enabled = var.use_cmk
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    id     = "expire-reports"
    status = "Enabled"
    filter {
      prefix = "reports/"
    }
    expiration {
      days = max(1, var.report_retention_days)
    }
  }

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "reports" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.reports.arn, "${aws_s3_bucket.reports.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "reports" {
  bucket     = aws_s3_bucket.reports.id
  policy     = data.aws_iam_policy_document.reports.json
  depends_on = [aws_s3_bucket_public_access_block.reports]
}

# ---------------------------------------------------------------- SQS

resource "aws_sqs_queue" "dlq" {
  name                              = "${var.name}-analyses-dlq"
  message_retention_seconds         = 1209600 # 14 days, time to inspect failures
  sqs_managed_sse_enabled           = var.use_cmk ? null : true
  kms_master_key_id                 = local.kms_key_arn
  kms_data_key_reuse_period_seconds = var.use_cmk ? 3600 : null
}

resource "aws_sqs_queue" "analyses" {
  name                              = "${var.name}-analyses"
  visibility_timeout_seconds        = var.visibility_timeout_seconds
  message_retention_seconds         = 345600 # 4 days, the most a diff may sit in the queue
  receive_wait_time_seconds         = 20
  max_message_size                  = 262144
  sqs_managed_sse_enabled           = var.use_cmk ? null : true
  kms_master_key_id                 = local.kms_key_arn
  kms_data_key_reuse_period_seconds = var.use_cmk ? 3600 : null

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue_redrive_allow_policy" "dlq" {
  queue_url = aws_sqs_queue.dlq.id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.analyses.arn]
  })
}

# ---------------------------------------------------------------- Gemini key

# Created with a placeholder. deploy.sh writes the real key after apply, so it never enters
# Terraform state; ignore_changes keeps Terraform from resetting it.
resource "aws_ssm_parameter" "gemini" {
  count       = var.create_gemini_parameter ? 1 : 0
  name        = "/${var.name}/gemini-api-key"
  description = "Gemini API key for diffwise workers. Written by deploy.sh."
  type        = "SecureString"
  key_id      = local.kms_key_arn
  value       = "unset"

  lifecycle {
    ignore_changes = [value]
  }
}

# ---------------------------------------------------------------- outputs

output "kms_key_arn" {
  value = local.kms_key_arn
}

output "reports_bucket" {
  value = aws_s3_bucket.reports.bucket
}

output "reports_bucket_arn" {
  value = aws_s3_bucket.reports.arn
}

output "queue_url" {
  value = aws_sqs_queue.analyses.id
}

output "queue_arn" {
  value = aws_sqs_queue.analyses.arn
}

output "queue_name" {
  value = aws_sqs_queue.analyses.name
}

output "dlq_name" {
  value = aws_sqs_queue.dlq.name
}

output "gemini_parameter_name" {
  value = var.create_gemini_parameter ? aws_ssm_parameter.gemini[0].name : ""
}

output "gemini_parameter_arn" {
  value = var.create_gemini_parameter ? aws_ssm_parameter.gemini[0].arn : ""
}
