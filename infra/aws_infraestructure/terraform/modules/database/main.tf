# Aurora PostgreSQL Serverless v2, reached only through the RDS Data API (HTTPS + IAM).
# - No database port is open to anything: the security group has no ingress rules.
# - The Data API pools connections, so Lambda bursts can't exhaust Postgres (no RDS Proxy needed).
# - min_acu = 0 (small) pauses the database after auto_pause_seconds idle; the next Data API
#   call resumes it in under ~15 s. Paused, you pay only for storage.

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "kms_key_arn" {
  type    = string
  default = null
}
variable "min_acu" { type = number }
variable "max_acu" { type = number }
variable "reader_count" { type = number }
variable "backup_retention_days" { type = number }

variable "engine_version" {
  description = "Must support 0 ACU and the Data API (16.3 or newer)."
  type        = string
  default     = "16.6"
}

variable "auto_pause_seconds" {
  type    = number
  default = 300
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "db" {
  name        = "${var.name}-db"
  description = "Aurora for diffwise. No ingress: all access goes through the RDS Data API."
  vpc_id      = var.vpc_id
}

resource "random_id" "final_snapshot" {
  byte_length = 4
}

resource "aws_rds_cluster" "this" {
  cluster_identifier = var.name
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = var.engine_version
  database_name      = "diffwise"
  master_username    = "diffwise_admin"

  # RDS creates and rotates the password in Secrets Manager; it never appears in Terraform.
  manage_master_user_password   = true
  master_user_secret_kms_key_id = var.kms_key_arn

  enable_http_endpoint   = true # RDS Data API
  storage_encrypted      = true
  kms_key_id             = var.kms_key_arn
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]

  backup_retention_period      = var.backup_retention_days
  preferred_backup_window      = "03:00-04:00"
  preferred_maintenance_window = "sun:04:30-sun:05:30"
  copy_tags_to_snapshot        = true

  # terraform destroy keeps a final snapshot (delete it by hand when you are sure).
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-final-${random_id.final_snapshot.hex}"
  deletion_protection       = false

  serverlessv2_scaling_configuration {
    min_capacity             = var.min_acu
    max_capacity             = var.max_acu
    seconds_until_auto_pause = var.min_acu == 0 ? var.auto_pause_seconds : null
  }
}

# Instance 0 is the writer; any extra instance is a reader in the other AZ for failover.
resource "aws_rds_cluster_instance" "this" {
  count                      = 1 + var.reader_count
  identifier                 = "${var.name}-${count.index}"
  cluster_identifier         = aws_rds_cluster.this.id
  instance_class             = "db.serverless"
  engine                     = aws_rds_cluster.this.engine
  engine_version             = aws_rds_cluster.this.engine_version
  db_subnet_group_name       = aws_db_subnet_group.this.name
  promotion_tier             = count.index
  auto_minor_version_upgrade = true
}

output "cluster_arn" {
  value = aws_rds_cluster.this.arn
}

output "cluster_id" {
  value = aws_rds_cluster.this.id
}

output "secret_arn" {
  value = aws_rds_cluster.this.master_user_secret[0].secret_arn
}

output "database_name" {
  value = aws_rds_cluster.this.database_name
}
