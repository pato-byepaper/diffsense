// Placeholder long-running worker (full deployment, systemd on EC2). Idles with a heartbeat and
// exits cleanly when systemd stops it or the Auto Scaling group marks the instance for termination.

const HEARTBEAT_MS = 5 * 60 * 1000;
const IMDS = 'http://169.254.169.254/latest'; // @diffsense-ignore: instance metadata is link-local HTTP by design

async function lifecycleState() {
  try {
    const token = await fetch(`${IMDS}/api/token`, {
      method: 'PUT',
      headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '60' },
      signal: AbortSignal.timeout(2000),
    }).then((r) => r.text());
    const res = await fetch(`${IMDS}/meta-data/autoscaling/target-lifecycle-state`, {
      headers: { 'X-aws-ec2-metadata-token': token },
      signal: AbortSignal.timeout(2000),
    });
    return res.ok ? (await res.text()).trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

let stopping = false;
const stop = (reason) => {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ msg: 'worker stopping', reason }));
  process.exit(0);
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

console.log(JSON.stringify({ msg: 'worker started (analysis not implemented yet)', queue: process.env.DIFFWISE_QUEUE_URL }));
setInterval(async () => {
  const state = await lifecycleState();
  if (state === 'Terminated') stop('scale-in');
  else console.log(JSON.stringify({ msg: 'heartbeat', lifecycle: state }));
}, HEARTBEAT_MS);
