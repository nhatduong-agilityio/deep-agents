import { Client } from '@langchain/langgraph-sdk';

const BASE_URL = process.env['LANGGRAPH_API_URL'] ?? 'http://localhost:2024';
const client = new Client({ apiUrl: BASE_URL });

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
    if (event.event === 'on_chain_end') break;
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
