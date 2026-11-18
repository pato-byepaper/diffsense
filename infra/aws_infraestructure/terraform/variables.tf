# Every input is mapped from infra/aws_infraestructure/.env by deploy.sh (DIFFWISE_* -> TF_VAR_*).
# Sizing inputs default to null, which means "use the value of the selected deployment preset".

variable "aws_region" {
  description = "AWS region for the whole stack."
  type        = string
}

variable "environment" {
  description = "Name prefix for every resource (for example prod or staging)."
  type        = string
  default     = "prod"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.environment))
    error_message = "environment must be 2-16 characters: lowercase letters, digits and dashes, starting with a letter."
  }
}

variable "deployment" {
  description = "small: serverless, scales to zero, a few USD per month. full: the production layout from the design doc."
  type        = string
  default     = "small"

  validation {
    condition     = contains(["small", "full"], var.deployment)
    error_message = "deployment must be small or full."
  }
}

variable "allowed_github_orgs" {
  description = "GitHub organizations whose OIDC tokens are accepted. Tokens from any other org are rejected."
  type        = list(string)

  validation {
    condition     = length(var.allowed_github_orgs) > 0
    error_message = "Set at least one GitHub organization in DIFFWISE_ALLOWED_GITHUB_ORGS."
  }
}

variable "llm_provider" {
  description = "bedrock (stays in your account), gemini (your own key) or offline (scanner only)."
  type        = string
  default     = "bedrock"

  validation {
    condition     = contains(["bedrock", "gemini", "offline"], var.llm_provider)
    error_message = "llm_provider must be bedrock, gemini or offline."
  }
}

variable "bedrock_model_id" {
  description = "Bedrock model or inference profile id. Required when llm_provider is bedrock."
  type        = string
  default     = ""

  validation {
    condition     = var.llm_provider != "bedrock" || length(var.bedrock_model_id) > 0
    error_message = "Set DIFFWISE_BEDROCK_MODEL_ID when DIFFWISE_LLM_PROVIDER=bedrock."
  }
}

variable "gemini_model" {
  description = "Gemini model id, used when llm_provider is gemini."
  type        = string
  default     = "gemini-3.8-flash"
}

variable "service_zip_path" {
  description = "Path to the service bundle built by deploy.sh (src, prompts, service, package.json)."
  type        = string
}

variable "alarm_email" {
  description = "Optional email for alarm notifications. AWS sends a confirmation email first."
  type        = string
  default     = ""
}

# --- Optional sizing overrides (null = preset value) ---

variable "report_retention_days" {
  type    = number
  default = null
}

variable "worker_instance_type" {
  description = "full only. EC2 instance type for workers."
  type        = string
  default     = null
}

variable "worker_min" {
  description = "full: minimum EC2 workers (at least 1). small: ignored."
  type        = number
  default     = null

  validation {
    condition     = var.worker_min == null || var.deployment != "full" || coalesce(var.worker_min, 1) >= 1
    error_message = "The full deployment needs DIFFWISE_WORKER_MIN of at least 1."
  }
}

variable "worker_max" {
  description = "full: maximum EC2 workers. small: maximum concurrent worker Lambdas (at least 2)."
  type        = number
  default     = null

  validation {
    condition     = var.worker_max == null || coalesce(var.worker_max, 2) >= 2
    error_message = "DIFFWISE_WORKER_MAX must be at least 2."
  }
}

variable "db_min_acu" {
  description = "Aurora Serverless v2 minimum capacity. 0 lets the database pause when idle."
  type        = number
  default     = null
}

variable "db_max_acu" {
  description = "Aurora Serverless v2 maximum capacity."
  type        = number
  default     = null
}

variable "db_multi_az" {
  description = "Add a reader instance in a second availability zone for failover."
  type        = bool
  default     = null
}

variable "enable_waf" {
  type    = bool
  default = null
}
