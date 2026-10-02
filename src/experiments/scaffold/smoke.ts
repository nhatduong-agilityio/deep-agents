import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { geminiToolFilter } from '../../lib/gemini-tool-filter.js';

const RUN_METADATA = { deepagents_version: '1.14.1', model_id: 'gemini-flash-lite-latest' };

const agent = createDeepAgent({
  model: 'google-genai:gemini-flash-lite-latest',
  middleware: [geminiToolFilter],
  backend: () => new FilesystemBackend(),
});

process.stdout.write('Running base agent smoke invocation...\n');
const result = await agent.invoke(
  { messages: [{ role: 'user', content: 'Reply with exactly: SCAFFOLD_OK' }] },
  { metadata: RUN_METADATA },
);

const last = result.messages.at(-1);
process.stdout.write(`Agent response: ${JSON.stringify(last?.content)}\n`);
process.stdout.write('Check LangSmith for trace: https://smith.langchain.com\n');
