import {
  FilesystemBackend,
  type FilesystemPermission,
  type FsToolName,
  type SubAgent,
} from 'deepagents';
import { makeFilesystemMiddleware } from '@deep-agents/core';
import type { ModelConfig } from '../artifact-agent/agent.js';

// Shared constants — imported by critic.ts (standalone agent) and makeCriticSpec (supervisor sub-agent)
// so both code paths always use identical BRC rules.
export const CRITIC_TOOLS: readonly FsToolName[] = ['read_file', 'ls', 'glob', 'write_file'];

export const CRITIC_PERMISSIONS: FilesystemPermission[] = [
  { operations: ['write'], paths: ['/feedback/**'], mode: 'allow' },
  { operations: ['write'], paths: ['/**'], mode: 'deny' },
];

export const CRITIC_SYSTEM_PROMPT =
  'You are a rigorous document critic. Your job is to identify genuine flaws in a draft ' +
  'document and write structured, numbered feedback.\n\n' +
  'Rules:\n' +
  '- Read the draft from the path specified in your task.\n' +
  '- Write a numbered list of flaws to the feedback path specified in your task.\n' +
  '- Each item must state: (1) what the specific problem is, (2) where in the document, ' +
  '(3) how to fix it.\n' +
  '- You CANNOT write outside /feedback/ — any such attempt will be denied.\n' +
  '- Do not produce text responses; use only tool calls.';

// Returns a SubAgent spec for use with createDeepAgent({ subagents: [makeCriticSpec(...)] }).
// The spec is built per-run so the FilesystemBackend rootDir resolves to the correct workDir.
// See DDR-015 for the design rationale.
export function makeCriticSpec(workDir: string, modelConfig: ModelConfig): SubAgent {
  const backendFactory = (): FilesystemBackend =>
    new FilesystemBackend({ rootDir: workDir, virtualMode: true });

  const criticFsMw = makeFilesystemMiddleware(backendFactory, CRITIC_PERMISSIONS, CRITIC_TOOLS);

  return {
    name: 'critic',
    description:
      'Critiques a document draft and writes a structured numbered list of flaws to /feedback/. ' +
      'Can read from any path; can only write to /feedback/**.',
    systemPrompt: CRITIC_SYSTEM_PROMPT,
    model: modelConfig.model,
    middleware: [criticFsMw],
  };
}
