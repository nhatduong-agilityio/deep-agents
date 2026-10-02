import { Client } from 'langsmith';

const apiKey = process.env['LANGCHAIN_API_KEY'];
if (!apiKey) {
  process.stderr.write('[langsmith] WARNING: LANGCHAIN_API_KEY is not set — tracing disabled\n');
}

export const langsmith = new Client();

// eslint-disable-next-line no-console
console.info('[langsmith] client initialized', {
  LANGCHAIN_TRACING_V2: process.env['LANGCHAIN_TRACING_V2'] ?? '(not set)',
  LANGCHAIN_PROJECT: process.env['LANGCHAIN_PROJECT'] ?? 'default',
  LANGCHAIN_API_KEY: apiKey ? '***set***' : '(not set)',
});
