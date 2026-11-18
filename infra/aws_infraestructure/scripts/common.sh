#!/usr/bin/env bash
# Shared by deploy.sh and destroy.sh: load .env, check tools, map DIFFWISE_* to TF_VAR_*,
# build the service bundle and initialize the Terraform backend.

set -euo pipefail

AWS_INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$AWS_INFRA_DIR/../.." && pwd)"
TF_DIR="$AWS_INFRA_DIR/terraform"
BUILD_DIR="$AWS_INFRA_DIR/build"
ENV_FILE="${DIFFWISE_ENV_FILE:-$AWS_INFRA_DIR/.env}"

say() { printf '\033[1m==>\033[0m %s\n' "$*" >&2; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

load_env() {
  [ -f "$ENV_FILE" ] || die "No $ENV_FILE. Copy .env.example to .env and fill it in."
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a

  : "${DIFFWISE_DEPLOYMENT:=small}"
  : "${DIFFWISE_ENVIRONMENT:=prod}"
  : "${DIFFWISE_LLM_PROVIDER:=bedrock}"
  [ -n "${AWS_REGION:-}" ] || die "Set AWS_REGION in .env."
  [ -n "${DIFFWISE_TF_STATE_BUCKET:-}" ] || die "Set DIFFWISE_TF_STATE_BUCKET in .env."
  [ -n "${DIFFWISE_ALLOWED_GITHUB_ORGS:-}" ] || die "Set DIFFWISE_ALLOWED_GITHUB_ORGS in .env."
  case "$DIFFWISE_DEPLOYMENT" in small|full) ;; *) die "DIFFWISE_DEPLOYMENT must be small or full." ;; esac
  case "$DIFFWISE_LLM_PROVIDER" in bedrock|gemini|offline) ;; *) die "DIFFWISE_LLM_PROVIDER must be bedrock, gemini or offline." ;; esac
  export AWS_DEFAULT_REGION="$AWS_REGION"
}

require_tools() {
  for t in terraform aws zip node; do
    command -v "$t" >/dev/null 2>&1 || die "$t is not installed."
  done
  aws sts get-caller-identity --query Account --output text >/dev/null 2>&1 \
    || die "AWS credentials in .env do not work (aws sts get-caller-identity failed)."
}

# "acme, acme-labs" -> ["acme","acme-labs"]
to_hcl_list() {
  local out="" item
  IFS=',' read -ra items <<<"$1"
  for item in "${items[@]}"; do
    item="$(echo "$item" | tr -d '[:space:]')"
    [ -n "$item" ] && out="$out\"$item\","
  done
  echo "[${out%,}]"
}

export_tf_vars() {
  export TF_VAR_aws_region="$AWS_REGION"
  export TF_VAR_environment="$DIFFWISE_ENVIRONMENT"
  export TF_VAR_deployment="$DIFFWISE_DEPLOYMENT"
  export TF_VAR_allowed_github_orgs
  TF_VAR_allowed_github_orgs="$(to_hcl_list "$DIFFWISE_ALLOWED_GITHUB_ORGS")"
  export TF_VAR_llm_provider="$DIFFWISE_LLM_PROVIDER"
  export TF_VAR_bedrock_model_id="${DIFFWISE_BEDROCK_MODEL_ID:-}"
  export TF_VAR_service_zip_path="$BUILD_DIR/service.zip"
  [ -n "${GEMINI_MODEL:-}" ] && export TF_VAR_gemini_model="$GEMINI_MODEL"
  [ -n "${DIFFWISE_ALARM_EMAIL:-}" ] && export TF_VAR_alarm_email="$DIFFWISE_ALARM_EMAIL"

  # Optional sizing overrides: only passed when set, so the preset decides otherwise.
  local pair env_name tf_name
  for pair in \
    DIFFWISE_REPORT_RETENTION_DAYS:report_retention_days \
    DIFFWISE_DB_MIN_ACU:db_min_acu \
    DIFFWISE_DB_MAX_ACU:db_max_acu \
    DIFFWISE_DB_MULTI_AZ:db_multi_az \
    DIFFWISE_WORKER_MIN:worker_min \
    DIFFWISE_WORKER_MAX:worker_max \
    DIFFWISE_WORKER_INSTANCE_TYPE:worker_instance_type \
    DIFFWISE_ENABLE_WAF:enable_waf; do
    env_name="${pair%%:*}"
    tf_name="${pair#*:}"
    if [ -n "${!env_name:-}" ]; then export "TF_VAR_$tf_name=${!env_name}"; fi
  done

  # The Gemini key goes to SSM after apply (put_gemini_key), never through Terraform.
  unset TF_VAR_gemini_api_key
}

# Reproducible zip (fixed timestamps, sorted entries): an unchanged bundle never redeploys
# the Lambdas or rolls the EC2 workers.
build_bundle() {
  say "Building service bundle"
  local stage="$BUILD_DIR/stage"
  rm -rf "$BUILD_DIR" && mkdir -p "$stage"
  (cd "$REPO_ROOT" && cp -R package.json src prompts service "$stage/")
  find "$stage" -exec touch -t 198001010000 {} +
  (cd "$stage" && find . -type f | LC_ALL=C sort | zip -q -X -@ "$BUILD_DIR/service.zip")
  rm -rf "$stage"
}

ensure_state_bucket() {
  local b="$DIFFWISE_TF_STATE_BUCKET"
  if aws s3api head-bucket --bucket "$b" >/dev/null 2>&1; then return; fi
  say "Creating Terraform state bucket s3://$b"
  if [ "$AWS_REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$b" >/dev/null
  else
    aws s3api create-bucket --bucket "$b" --create-bucket-configuration "LocationConstraint=$AWS_REGION" >/dev/null
  fi
  aws s3api put-public-access-block --bucket "$b" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-versioning --bucket "$b" --versioning-configuration Status=Enabled
  aws s3api put-bucket-encryption --bucket "$b" --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
}

tf_init() {
  say "terraform init (state: s3://$DIFFWISE_TF_STATE_BUCKET/diffwise/$DIFFWISE_ENVIRONMENT.tfstate)"
  terraform -chdir="$TF_DIR" init -input=false -reconfigure \
    -backend-config="bucket=$DIFFWISE_TF_STATE_BUCKET" \
    -backend-config="key=diffwise/$DIFFWISE_ENVIRONMENT.tfstate" \
    -backend-config="region=$AWS_REGION" \
    -backend-config="encrypt=true" \
    -backend-config="use_lockfile=true" >/dev/null
}
