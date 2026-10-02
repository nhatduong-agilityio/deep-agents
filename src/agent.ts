import { todoListMiddleware } from 'langchain';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { geminiToolFilter } from './lib/gemini-tool-filter.js';

// write_todos is not built-in for Google models — must add todoListMiddleware explicitly
export const graph = createDeepAgent({
  model: 'google-genai:gemini-flash-lite-latest',
  middleware: [geminiToolFilter, todoListMiddleware()],
  backend: () => new FilesystemBackend(),
});
