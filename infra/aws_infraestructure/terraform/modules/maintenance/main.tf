# Scheduled housekeeping: purge expired analyses and reports, roll up metrics.
# small runs it daily so the paused database wakes up as rarely as possible.

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
variable "schedule_expression" { type = string }

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "maintenance" {
  name               = "${var.name}-maintenance"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.maintenance.name
  policy_arn = "arn:${var.partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "maintenance" {
  name   = "service"
  role   = aws_iam_role.maintenance.id
  policy = var.policy_json
}

resource "aws_cloudwatch_log_group" "maintenance" {
  name              = "/aws/lambda/${var.name}-maintenance"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

resource "aws_lambda_function" "maintenance" {
  function_name    = "${var.name}-maintenance"
  role             = aws_iam_role.maintenance.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "service/maintenance.handler"
  filename         = var.zip_path
  source_code_hash = var.zip_hash
  memory_size      = 256
  timeout          = 300

  environment {
    variables = var.env
  }

  depends_on = [aws_cloudwatch_log_group.maintenance, aws_iam_role_policy_attachment.logs]
}

resource "aws_cloudwatch_event_rule" "schedule" {
  name                = "${var.name}-maintenance"
  schedule_expression = var.schedule_expression
}

resource "aws_cloudwatch_event_target" "maintenance" {
  rule = aws_cloudwatch_event_rule.schedule.name
  arn  = aws_lambda_function.maintenance.arn
}

resource "aws_lambda_permission" "events" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.maintenance.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.schedule.arn
}
