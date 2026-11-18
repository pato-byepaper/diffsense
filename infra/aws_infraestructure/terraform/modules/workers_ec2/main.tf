# full: analysis workers on an EC2 Auto Scaling group in private subnets.
# - No SSH, no public IP: SSM Session Manager only. IMDSv2 required.
# - The service bundle is uploaded to S3 by Terraform and pulled through the S3 gateway endpoint,
#   verified against its SHA-256. Workers never need the internet unless the LLM is Gemini.
# - Scales on queue backlog per instance (target: jobs_per_instance).

variable "name" { type = string }
variable "region" { type = string }
variable "partition" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "instance_type" { type = string }
variable "min_size" { type = number }
variable "max_size" { type = number }
variable "jobs_per_instance" { type = number }
variable "zip_path" { type = string }
variable "artifact_bucket" { type = string }
variable "env" { type = map(string) }
variable "policy_json" { type = string }
variable "kms_key_arn" {
  type    = string
  default = null
}
variable "log_retention_days" { type = number }
variable "queue_name" { type = string }

locals {
  # Graviton families (c7g, m7g, t4g, ...) have a "g" right after the generation digit.
  arch         = can(regex("^[a-z]+[0-9]+g", var.instance_type)) ? "arm64" : "x86_64"
  zip_sha256   = filesha256(var.zip_path)
  artifact_key = "artifacts/service-${local.zip_sha256}.zip"
  log_group    = "/diffwise/${var.name}/worker"
}

# ---------------------------------------------------------------- artifact

resource "aws_s3_object" "service" {
  bucket      = var.artifact_bucket
  key         = local.artifact_key
  source      = var.zip_path
  source_hash = local.zip_sha256
}

# ---------------------------------------------------------------- IAM

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "worker" {
  name               = "${var.name}-worker-ec2"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.worker.name
  policy_arn = "arn:${var.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.worker.name
  policy_arn = "arn:${var.partition}:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_role_policy" "service" {
  name   = "service"
  role   = aws_iam_role.worker.id
  policy = var.policy_json
}

data "aws_iam_policy_document" "artifact" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["arn:${var.partition}:s3:::${var.artifact_bucket}/artifacts/*"]
  }
}

resource "aws_iam_role_policy" "artifact" {
  name   = "artifact"
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.artifact.json
}

resource "aws_iam_instance_profile" "worker" {
  name = "${var.name}-worker"
  role = aws_iam_role.worker.name
}

# ---------------------------------------------------------------- network + logs

resource "aws_security_group" "worker" {
  name        = "${var.name}-worker"
  description = "diffwise workers: no inbound, HTTPS outbound only"
  vpc_id      = var.vpc_id

  egress {
    description = "HTTPS to VPC endpoints, S3 and (Gemini only) the internet via NAT"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = local.log_group
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

# ---------------------------------------------------------------- launch template + ASG

resource "aws_launch_template" "worker" {
  name_prefix            = "${var.name}-worker-"
  image_id               = "resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-${local.arch}"
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.worker.id]
  update_default_version = true

  iam_instance_profile {
    arn = aws_iam_instance_profile.worker.arn
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "disabled"
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 20
      volume_type           = "gp3"
      encrypted             = true # account default EBS key
      delete_on_termination = true
    }
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh.tftpl", {
    region          = var.region
    artifact_bucket = var.artifact_bucket
    artifact_key    = local.artifact_key
    artifact_sha256 = local.zip_sha256
    log_group       = local.log_group
    env             = var.env
  }))

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.name}-worker" }
  }

  tag_specifications {
    resource_type = "volume"
    tags          = { Name = "${var.name}-worker" }
  }

  depends_on = [aws_s3_object.service]
}

resource "aws_autoscaling_group" "worker" {
  name                = "${var.name}-workers"
  min_size            = var.min_size
  max_size            = var.max_size
  vpc_zone_identifier = var.subnet_ids
  health_check_type   = "EC2"
  enabled_metrics     = ["GroupInServiceInstances", "GroupDesiredCapacity"]

  launch_template {
    id      = aws_launch_template.worker.id
    version = aws_launch_template.worker.latest_version
  }

  # A new bundle or AMI setting rolls instances gradually.
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
    }
  }

  tag {
    key                 = "Name"
    value               = "${var.name}-worker"
    propagate_at_launch = true
  }

  lifecycle {
    ignore_changes = [desired_capacity]
  }
}

# Graceful shutdown: a terminating instance waits up to 16 minutes. The worker sees the
# "Terminated" target state in instance metadata, stops taking jobs and finishes the current one.
resource "aws_autoscaling_lifecycle_hook" "drain" {
  name                   = "drain"
  autoscaling_group_name = aws_autoscaling_group.worker.name
  lifecycle_transition   = "autoscaling:EC2_INSTANCE_TERMINATING"
  heartbeat_timeout      = 960
  default_result         = "CONTINUE"
}

resource "aws_autoscaling_policy" "backlog" {
  name                   = "backlog-per-instance"
  autoscaling_group_name = aws_autoscaling_group.worker.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    target_value = var.jobs_per_instance

    customized_metric_specification {
      metrics {
        id          = "visible"
        return_data = false
        metric_stat {
          stat = "Sum"
          metric {
            namespace   = "AWS/SQS"
            metric_name = "ApproximateNumberOfMessagesVisible"
            dimensions {
              name  = "QueueName"
              value = var.queue_name
            }
          }
        }
      }

      metrics {
        id          = "inflight"
        return_data = false
        metric_stat {
          stat = "Sum"
          metric {
            namespace   = "AWS/SQS"
            metric_name = "ApproximateNumberOfMessagesNotVisible"
            dimensions {
              name  = "QueueName"
              value = var.queue_name
            }
          }
        }
      }

      metrics {
        id          = "instances"
        return_data = false
        metric_stat {
          stat = "Average"
          metric {
            namespace   = "AWS/AutoScaling"
            metric_name = "GroupInServiceInstances"
            dimensions {
              name  = "AutoScalingGroupName"
              value = aws_autoscaling_group.worker.name
            }
          }
        }
      }

      metrics {
        id          = "backlog"
        label       = "Jobs per instance"
        expression  = "(visible + inflight) / IF(instances > 0, instances, 1)"
        return_data = true
      }
    }
  }
}

output "asg_name" {
  value = aws_autoscaling_group.worker.name
}
