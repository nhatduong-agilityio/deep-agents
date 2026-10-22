import { Client } from '@langchain/langgraph-sdk';

const BASE_URL = process.env['LANGGRAPH_API_URL'] ?? 'http://localhost:2024';
// The API rejects unauthenticated requests when AUTH_TOKEN is set (apps/api/src/auth.ts); never print it.
const AUTH_TOKEN = process.env['AUTH_TOKEN'];
const client = new Client({
  apiUrl: BASE_URL,
  ...(AUTH_TOKEN ? { defaultHeaders: { Authorization: `Bearer ${AUTH_TOKEN}` } } : {}),
});

process.stdout.write(`Connecting to LangGraph Server at ${BASE_URL}\n`);

let eventCount = 0;
const thread = await client.threads.create();

try {
  const stream = client.runs.stream(thread.thread_id, 'agent', {
    input: { messages: [{ role: 'user', content: 'Reply with exactly: SMOKE_OK' }] },
    streamMode: 'events',
  });

  for await (const event of stream) {
    eventCount++;
    if (eventCount === 1) {
      process.stdout.write(`First event type: ${event.event}\n`);
    }
    // Stop after first meaningful response
    if ((event.event as string) === 'on_chain_end') break;
    if (eventCount > 50) break;
  }
} finally {
  await client.threads.delete(thread.thread_id).catch(() => {});
}

if (eventCount < 1) {
  process.stderr.write('FAIL: no events received from server\n');
  process.exit(1);
}

process.stdout.write(`PASS: received ${eventCount} event(s) from ${BASE_URL}/agent\n`);
