# small: analysis workers as an SQS-triggered Lambda. Costs nothing while idle.
# One job per invocation, up to 15 minutes each, at most max_concurrency at a time.

variable "name" { type = string }
variable "zip_path" { type = string }
variable "zip_hash" { type = string }
variable "env" { type = map(string) }
variable "policy_json" { type = string }
variable "partition" { type = string }
variable "kms_key_arn" {
  type    = string
  default = null
}
variable "log_retention_days" { type = number }
variable "queue_arn" { type = string }
variable "max_concurrency" { type = number }

variable "memory_mb" {
  type    = number
  default = 1024
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "worker" {
  name               = "${var.name}-worker"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.worker.name
  policy_arn = "arn:${var.partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "worker" {
  name   = "service"
  role   = aws_iam_role.worker.id
  policy = var.policy_json
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${var.name}-worker"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

resource "aws_lambda_function" "worker" {
  function_name    = "${var.name}-worker"
  role             = aws_iam_role.worker.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "service/worker.handler"
  filename         = var.zip_path
  source_code_hash = var.zip_hash
  memory_size      = var.memory_mb
  timeout          = 900

  environment {
    variables = var.env
  }

  depends_on = [aws_cloudwatch_log_group.worker, aws_iam_role_policy_attachment.logs]
}

resource "aws_lambda_event_source_mapping" "queue" {
  event_source_arn        = var.queue_arn
  function_name           = aws_lambda_function.worker.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = var.max_concurrency
  }

  depends_on = [aws_iam_role_policy.worker]
}

output "function_name" {
  value = aws_lambda_function.worker.function_name
}
