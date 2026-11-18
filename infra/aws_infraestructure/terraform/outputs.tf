output "diffwise_api_url" {
  description = "Set this as the GitHub organization Actions variable DIFFWISE_API_URL."
  value       = module.api.api_url
}

output "health_check_url" {
  description = "Open this to confirm the stack answers."
  value       = "${module.api.api_url}/healthz"
}

output "deployment" {
  value = var.deployment
}

output "reports_bucket" {
  value = module.core.reports_bucket
}

output "queue_url" {
  value = module.core.queue_url
}

output "gemini_key_parameter" {
  description = "SSM parameter that holds the Gemini key. deploy.sh writes it after apply so the key never enters Terraform state."
  value       = module.core.gemini_parameter_name
}

output "dashboard_url" {
  value = module.observability.dashboard_url
}

output "next_step" {
  value = "Set the GitHub organization variable DIFFWISE_API_URL to ${module.api.api_url}"
}
