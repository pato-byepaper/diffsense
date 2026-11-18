#!/usr/bin/env bash
# Remove the whole diffwise stack from your AWS account (terraform destroy).
# Aurora keeps a final snapshot named diffwise-<environment>-final-<id>; delete it in the RDS
# console when you no longer need the data. The Terraform state bucket is kept.

# shellcheck source=scripts/common.sh
. "$(cd "$(dirname "$0")" && pwd)/scripts/common.sh"

load_env
require_tools
export_tf_vars
build_bundle # Terraform reads the bundle hash even when destroying
ensure_state_bucket
tf_init

say "Destroying diffwise-$DIFFWISE_ENVIRONMENT ($DIFFWISE_DEPLOYMENT) in $AWS_REGION. Terraform will ask to confirm."
terraform -chdir="$TF_DIR" destroy
