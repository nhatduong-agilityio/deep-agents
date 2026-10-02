import { writeFileSync, mkdirSync } from 'node:fs';
import { todoListMiddleware } from 'langchain';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { geminiToolFilter } from '../../lib/gemini-tool-filter.js';

// Trace metadata pattern: attach to every invocation so T-DA-07 can validate spans
const RUN_METADATA = { deepagents_version: '1.14.1', model_id: 'gemini-flash-lite-latest' };

const agent = createDeepAgent({
  model: 'google-genai:gemini-flash-lite-latest',
  middleware: [geminiToolFilter, todoListMiddleware()],
  backend: () => new FilesystemBackend(),
});

// Dump the tool list from all middleware so DoD evidence is machine-readable
const tools = (agent.options.middleware ?? []).flatMap((mw) =>
  (mw.tools ?? []).map((t) => ({ name: t.name, middleware: mw.name })),
);

mkdirSync('docs', { recursive: true });
writeFileSync('docs/tool-list-default.json', JSON.stringify({ tools }, null, 2));
process.stdout.write(`Tool list written to docs/tool-list-default.json\n`);
process.stdout.write(`Tools: ${tools.map((t) => t.name).join(', ')}\n`);
process.stdout.write(
  `write_todos present: ${tools.some((t) => t.name === 'write_todos') ? 'YES' : 'NO'}\n`,
);

// Smoke-invoke: one-shot to confirm LangSmith trace fires
process.stdout.write('\nRunning smoke invocation...\n');
const result = await agent.invoke(
  { messages: [{ role: 'user', content: 'Reply with exactly: SCAFFOLD_OK' }] },
  { metadata: RUN_METADATA },
);

const lastMessage = result.messages.at(-1);
process.stdout.write(`Agent response: ${JSON.stringify(lastMessage?.content)}\n`);
process.stdout.write('Check LangSmith for trace: https://smith.langchain.com\n');
