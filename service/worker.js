// Placeholder SQS worker (small deployment). Acknowledges each message without analyzing it.
// Only ids are logged: message bodies hold diffs and must never reach the logs.

export async function handler(event) {
  for (const record of event.Records || []) {
    console.log(JSON.stringify({ msg: 'analysis received (worker not implemented yet)', messageId: record.messageId }));
  }
  return { batchItemFailures: [] };
}
