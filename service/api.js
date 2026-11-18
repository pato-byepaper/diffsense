// Placeholder API for the self-hosted PR gate. Answers GET /healthz so a fresh deploy can be
// smoke-tested; the /v1 endpoints from the design doc are not implemented yet.

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

export async function handler(event) {
  const method = event.httpMethod || 'GET';
  const path = event.path || '/';
  if (method === 'GET' && (path === '/healthz' || path === '/')) {
    return json(200, {
      ok: true,
      service: 'diffwise',
      environment: process.env.DIFFWISE_ENVIRONMENT,
      deployment: process.env.DIFFWISE_DEPLOYMENT,
      llm: process.env.DIFFWISE_LLM_PROVIDER,
    });
  }
  return json(501, { error: 'not_implemented', message: `${method} ${path} is not implemented yet.` });
}
