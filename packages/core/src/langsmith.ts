import { Client } from 'langsmith';

// SDK reads LANGSMITH_API_KEY first, falls back to LANGCHAIN_API_KEY (legacy)
const apiKey = process.env['LANGSMITH_API_KEY'] ?? process.env['LANGCHAIN_API_KEY'];
if (!apiKey) {
  process.stderr.write('[langsmith] WARNING: LANGSMITH_API_KEY is not set — tracing disabled\n');
}

export const langsmith = new Client();

const tracingEnabled =
  process.env['LANGSMITH_TRACING'] ??
  process.env['LANGSMITH_TRACING_V2'] ??
  process.env['LANGCHAIN_TRACING_V2'] ??
  '(not set)';

const project = process.env['LANGSMITH_PROJECT'] ?? process.env['LANGCHAIN_PROJECT'] ?? 'default';

// eslint-disable-next-line no-console
console.info('[langsmith] client initialized', {
  tracing: tracingEnabled,
  project,
  apiKey: apiKey ? '***set***' : '(not set)',
});
