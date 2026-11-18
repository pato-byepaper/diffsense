# service/

Runtime code for the self-hosted PR gate (see `infra/aws_infraestructure/diffwise-cloud.md`).
Every cloud deployment (`infra/aws_infraestructure/` today, `infra/gcp_*` later) ships this same
folder together with `src/`, `prompts/` and `package.json`.

**Status: placeholders.** The handlers below let a stack deploy and pass a health check. The real
API (OIDC verification, `/v1/analyses`), worker (LLM checks, policy engine) and maintenance logic
are phase 1-2 of the rollout plan and are not implemented yet.

| File | Runs as | Today |
|:---|:---|:---|
| `api.js` | Lambda behind API Gateway | `GET /healthz` answers; every other route returns `501` |
| `worker.js` | Lambda on the SQS queue (small) | Logs and acknowledges each message |
| `worker-ec2.js` | systemd service on EC2 (full) | Idles, logs a heartbeat, drains on scale-in |
| `maintenance.js` | Scheduled Lambda | Logs that it ran |
