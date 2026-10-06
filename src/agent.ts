import { createDeepAgent, FilesystemBackend } from 'deepagents';

export const graph = createDeepAgent({
  model: 'openai:gpt-5.4-mini-2026-03-17',
  backend: () => new FilesystemBackend(),
});
