import { resolve } from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';
import {
  CompositeBackend,
  FilesystemBackend,
  StateBackend,
  createDeepAgent,
  createHarnessProfile,
  registerHarnessProfile,
  type AnyBackendProtocol,
  type FilesystemPermission,
} from 'deepagents';
import { z } from 'zod';
import { makeFilesystemMiddleware } from './lib/fs-middleware.js';

const POLICY_ANALYST_MODEL = 'openai:gpt-5.4-mini-2026-03-17';

// Disable GP sub-agent and hide `task` — T-FS-01 v1 is single-agent only.
// Must run before createDeepAgent so the profile is visible at assembly time.
registerHarnessProfile(
  POLICY_ANALYST_MODEL,
  createHarnessProfile({
    generalPurposeSubagent: { enabled: false },
    excludedTools: ['task'],
  }),
);

// Ordered permissions — last matching rule wins; deny-write catch-all is last.
const PERMISSIONS: FilesystemPermission[] = [
  { operations: ['read'], paths: ['/corpus/**'], mode: 'allow' },
  { operations: ['read'], paths: ['/skills/**'], mode: 'allow' },
  { operations: ['read', 'write'], paths: ['/report/**'], mode: 'allow' },
  { operations: ['read', 'write'], paths: ['/notes/**'], mode: 'allow' },
  { operations: ['write'], paths: ['/**'], mode: 'deny' },
];

// Explicit allowlist — execute, delete, edit_file, and task excluded by design.
const FS_TOOLS = ['read_file', 'ls', 'glob', 'grep', 'write_file'] as const;

function makeCompositeBackend(): AnyBackendProtocol {
  const root = process.cwd();
  return new CompositeBackend(new StateBackend(), {
    '/skills/': new FilesystemBackend({ rootDir: resolve(root, 'skills'), virtualMode: false }),
    '/corpus/': new FilesystemBackend({ rootDir: resolve(root, 'corpus'), virtualMode: false }),
  });
}

// Accumulates per-call cost into thread state; halts the run if budget is exceeded.
// cost formula: inputTokens × $0.00000075 + outputTokens × $0.0000045 (DDR-012)
const threadBudgetMiddleware = createMiddleware({
  name: 'ThreadBudgetMiddleware',
  stateSchema: z.object({
    threadCostUsd: z.number().default(0),
  }),
  afterModel: async (state) => {
    const msgs = state.messages as unknown[];
    const lastMsg = msgs[msgs.length - 1];
    const ai = lastMsg instanceof AIMessage ? lastMsg : undefined;
    const inputTokens = ai?.usage_metadata?.input_tokens ?? 0;
    const outputTokens = ai?.usage_metadata?.output_tokens ?? 0;
    const callCost = inputTokens * 0.00000075 + outputTokens * 0.0000045;
    return { threadCostUsd: (state.threadCostUsd ?? 0) + callCost };
  },
  beforeModel: async (state) => {
    const budget = parseFloat(process.env['THREAD_BUDGET_USD'] ?? '0.10');
    if ((state.threadCostUsd ?? 0) >= budget) {
      throw Object.assign(new Error('Thread budget exceeded'), {
        code: 'THREAD_BUDGET_EXCEEDED',
      });
    }
  },
});

const fsMiddleware = makeFilesystemMiddleware(makeCompositeBackend, PERMISSIONS, FS_TOOLS);

// Exported as 'graph' — the name LangGraph Server looks for in the manifest.
export const graph = createDeepAgent({
  model: POLICY_ANALYST_MODEL,
  backend: makeCompositeBackend,
  skills: ['/skills/'],
  permissions: PERMISSIONS,
  middleware: [fsMiddleware, threadBudgetMiddleware],
});
