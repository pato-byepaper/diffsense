# Alarms -> SNS (-> email if set).
# small: 2 alarms (failed jobs, stuck queue), about 0.20 USD/month.
# full:  plus API errors, worker errors, database load, and a dashboard (3 USD/month).

variable "name" { type = string }
variable "region" { type = string }
variable "kms_key_arn" {
  type    = string
  default = null
}
variable "alarm_email" { type = string }
variable "detailed" { type = bool }
variable "queue_name" { type = string }
variable "dlq_name" { type = string }
variable "api_function_name" { type = string }
variable "api_name" { type = string }
variable "api_stage" { type = string }
variable "worker_function_name" { type = string }
variable "worker_asg_name" { type = string }
variable "db_cluster_id" { type = string }

variable "oldest_message_seconds" {
  type    = number
  default = 300
}

resource "aws_sns_topic" "alarms" {
  name = "${var.name}-alarms"
  # CloudWatch can't publish to a topic encrypted with the AWS-managed SNS key, so small stays
  # unencrypted (alarm text only, no code); full uses the stack key.
  kms_master_key_id = var.kms_key_arn
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

locals {
  actions = [aws_sns_topic.alarms.arn]
}

# ---------------------------------------------------------------- always

resource "aws_cloudwatch_metric_alarm" "dlq" {
  alarm_name          = "${var.name}-failed-analyses"
  alarm_description   = "An analysis failed 3 times and landed in the dead-letter queue."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = var.dlq_name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

resource "aws_cloudwatch_metric_alarm" "queue_age" {
  alarm_name          = "${var.name}-queue-stuck"
  alarm_description   = "The oldest queued analysis has waited too long. Workers may be down."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  dimensions          = { QueueName = var.queue_name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.oldest_message_seconds
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

# ---------------------------------------------------------------- full only

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  count               = var.detailed ? 1 : 0
  alarm_name          = "${var.name}-api-5xx"
  alarm_description   = "More than 5% of API requests failed with a server error."
  comparison_operator = "GreaterThanThreshold"
  threshold           = 5
  evaluation_periods  = 3
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions

  metric_query {
    id = "errors"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions  = { ApiName = var.api_name, Stage = var.api_stage }
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id = "requests"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "Count"
      dimensions  = { ApiName = var.api_name, Stage = var.api_stage }
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id          = "rate"
    expression  = "IF(requests > 20, 100 * errors / requests, 0)"
    label       = "5xx rate (%)"
    return_data = true
  }
}

resource "aws_cloudwatch_metric_alarm" "api_lambda_errors" {
  count               = var.detailed ? 1 : 0
  alarm_name          = "${var.name}-api-lambda-errors"
  alarm_description   = "The API Lambda is throwing errors."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = var.api_function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

resource "aws_cloudwatch_metric_alarm" "db_load" {
  count               = var.detailed ? 1 : 0
  alarm_name          = "${var.name}-db-capacity"
  alarm_description   = "Aurora is using over 80% of its maximum capacity. Raise DIFFWISE_DB_MAX_ACU."
  namespace           = "AWS/RDS"
  metric_name         = "ACUUtilization"
  dimensions          = { DBClusterIdentifier = var.db_cluster_id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

resource "aws_cloudwatch_metric_alarm" "workers_at_max" {
  count               = var.detailed && var.worker_asg_name != "" ? 1 : 0
  alarm_name          = "${var.name}-workers-saturated"
  alarm_description   = "Workers are at the maximum count and the queue is still backing up. Raise DIFFWISE_WORKER_MAX."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = var.queue_name }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 20
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

resource "aws_cloudwatch_dashboard" "this" {
  count          = var.detailed ? 1 : 0
  dashboard_name = var.name
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title  = "Queue"
          region = var.region
          stat   = "Maximum"
          period = 60
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.queue_name, { label = "Waiting" }],
            ["AWS/SQS", "ApproximateNumberOfMessagesNotVisible", "QueueName", var.queue_name, { label = "In progress" }],
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.dlq_name, { label = "Failed (DLQ)" }],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title  = "API"
          region = var.region
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiName", var.api_name, "Stage", var.api_stage, { label = "Requests" }],
            ["AWS/ApiGateway", "4XXError", "ApiName", var.api_name, "Stage", var.api_stage, { label = "4xx" }],
            ["AWS/ApiGateway", "5XXError", "ApiName", var.api_name, "Stage", var.api_stage, { label = "5xx" }],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title  = "API latency (p50 / p95)"
          region = var.region
          period = 300
          metrics = [
            ["AWS/ApiGateway", "Latency", "ApiName", var.api_name, "Stage", var.api_stage, { stat = "p50", label = "p50" }],
            ["AWS/ApiGateway", "Latency", "ApiName", var.api_name, "Stage", var.api_stage, { stat = "p95", label = "p95" }],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6
        properties = {
          title  = "Workers and database"
          region = var.region
          period = 300
          metrics = concat(
            var.worker_asg_name == "" ? [] : [["AWS/AutoScaling", "GroupInServiceInstances", "AutoScalingGroupName", var.worker_asg_name, { stat = "Average", label = "Workers" }]],
            [["AWS/RDS", "ServerlessDatabaseCapacity", "DBClusterIdentifier", var.db_cluster_id, { stat = "Average", label = "Database ACU" }]],
          )
        }
      },
    ]
  })
}

output "topic_arn" {
  value = aws_sns_topic.alarms.arn
}

output "dashboard_url" {
  value = var.detailed ? "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${var.name}" : ""
}
