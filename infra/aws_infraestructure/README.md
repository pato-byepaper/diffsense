# diffwise on AWS

Self-hosted PR gate in **your own AWS account**, deployed with Terraform from a `.env`.
Nothing is sent to ByePaper. The full design is in [diffwise-cloud.md](diffwise-cloud.md).

> **Status:** the infrastructure is written but has not been applied to a real account yet, and the
> service code in [`/service`](../../service) is placeholders (`/healthz` only). Run
> `./deploy.sh --plan-only` first.

## Pick a deployment type

| | `small` (default) | `full` |
|:---|:---|:---|
| For | Startups and small teams on a tight budget | Production at scale |
| Workers | Lambda | EC2 Auto Scaling (Graviton), private subnets |
| Database | Aurora Serverless v2, **pauses when idle** | Aurora Serverless v2, always on, multi-AZ |
| Network | No NAT, no VPC endpoints | VPC endpoints, no internet route (NAT only for Gemini) |
| Extras | none | WAF, customer KMS key, dashboard, 6 alarms |
| Rough cost | **~1-2 USD idle, ~2-10 USD/month typical** | ~330 USD/month |

LLM usage is billed separately (Bedrock in your account, or your Gemini key, or `offline`).
`small` adds ~15 s to the first analysis after an idle period while the database resumes.

## Deploy

Needs Terraform 1.10+, the AWS CLI v2, `zip` and Node.js 22+.

```sh
cd infra/aws_infraestructure
cp .env.example .env        # pick small|full, add AWS credentials, state bucket, GitHub orgs, LLM
./deploy.sh --plan-only     # review what will be created
./deploy.sh                 # plan, confirm, apply
curl "$(terraform -chdir=terraform output -raw health_check_url)"
```

Then set the GitHub organization **Actions variable** `DIFFWISE_API_URL` to the printed `diffwise_api_url`.

Remove everything with `./destroy.sh` (a final database snapshot is kept).

## Layout

```text
.env.example          settings + credentials template (copy to .env, gitignored)
deploy.sh             build bundle, terraform init/plan/apply, store Gemini key in SSM
destroy.sh            terraform destroy
scripts/common.sh     shared helpers
diffwise-cloud.md     design document
terraform/            root module, presets in main.tf, modules/, deployer-policy.json
```

A GCP version will live next to this folder (`infra/gcp_*`) and ship the same `service/` code.
