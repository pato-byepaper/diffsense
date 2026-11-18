#!/usr/bin/env bash
# Deploy (or update) the diffwise PR gate into your AWS account.
#   ./deploy.sh              plan, ask, apply
#   ./deploy.sh --yes        apply without asking (CI)
#   ./deploy.sh --plan-only  show the plan and stop
# Reads infra/aws_infraestructure/.env (or DIFFWISE_ENV_FILE).

# shellcheck source=scripts/common.sh
. "$(cd "$(dirname "$0")" && pwd)/scripts/common.sh"

AUTO_APPROVE=false
PLAN_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_APPROVE=true ;;
    --plan-only) PLAN_ONLY=true ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) die "Unknown option: $arg" ;;
  esac
done

load_env
require_tools
export_tf_vars
build_bundle
ensure_state_bucket
tf_init

say "Planning a '$DIFFWISE_DEPLOYMENT' deployment of diffwise-$DIFFWISE_ENVIRONMENT in $AWS_REGION"
terraform -chdir="$TF_DIR" plan -input=false -out=tfplan

if $PLAN_ONLY; then
  rm -f "$TF_DIR/tfplan"
  exit 0
fi

if ! $AUTO_APPROVE; then
  printf 'Apply this plan? [y/N] ' >&2
  read -r answer
  case "$answer" in y|Y|yes|YES) ;; *) rm -f "$TF_DIR/tfplan"; die "Cancelled." ;; esac
fi

terraform -chdir="$TF_DIR" apply -input=false tfplan
rm -f "$TF_DIR/tfplan"

# Write the Gemini key straight to SSM so it never enters Terraform state or argv.
if [ "$DIFFWISE_LLM_PROVIDER" = "gemini" ]; then
  param="$(terraform -chdir="$TF_DIR" output -raw gemini_key_parameter)"
  if [ -n "${GEMINI_API_KEY:-}" ]; then
    say "Storing GEMINI_API_KEY in SSM parameter $param"
    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' EXIT
    chmod 600 "$tmp"
    node -e 'process.stdout.write(JSON.stringify({Name: process.argv[1], Value: process.env.GEMINI_API_KEY, Overwrite: true}))' "$param" >"$tmp"
    aws ssm put-parameter --cli-input-json "file://$tmp" >/dev/null
  else
    say "GEMINI_API_KEY is empty. Set it in .env and run ./deploy.sh again, or write it to $param yourself."
  fi
fi

echo
terraform -chdir="$TF_DIR" output
echo
say "Check it: curl \"\$(terraform -chdir=$TF_DIR output -raw health_check_url)\""
