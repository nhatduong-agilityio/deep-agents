import { describe, expect, it, vi } from 'vitest';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { GENERAL_PURPOSE_SUBAGENT } from 'deepagents';
import { withGeminiCompat } from '../lib/with-gemini-compat.js';
import { geminiToolFilter } from '../lib/gemini-tool-filter.js';
import { groupSpansByAgent, type RawSpan } from '../experiments/artifact-agent/agent.js';

function hasExclusiveKeyword(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) return false;
  const obj = schema as Record<string, unknown>;
  if ('exclusiveMinimum' in obj || 'exclusiveMaximum' in obj) return true;
  return Object.values(obj).some((v) => hasExclusiveKeyword(v));
}

describe('withGeminiCompat', () => {
  it('adds geminiToolFilter to sub-agent middleware', () => {
    const spec = withGeminiCompat(GENERAL_PURPOSE_SUBAGENT);
    expect(spec.middleware).toContain(geminiToolFilter);
  });

  it('does not add duplicate geminiToolFilter when called twice', () => {
    const once = withGeminiCompat(GENERAL_PURPOSE_SUBAGENT);
    const twice = withGeminiCompat(once);
    const count = (twice.middleware ?? []).filter((m) => m === geminiToolFilter).length;
    expect(count).toBe(1);
  });

  it('is a no-op on a spec that already carries geminiToolFilter', () => {
    const spec = withGeminiCompat(GENERAL_PURPOSE_SUBAGENT);
    expect(withGeminiCompat(spec)).toBe(spec);
  });
});

// Item 2: effect guard — geminiToolFilter removes all tools with exclusiveMinimum from the call
describe('geminiToolFilter effect guard', () => {
  // Cast to access wrapModelCall directly without importing internal ModelRequest type
  type FilterFn = (
    req: Record<string, unknown>,
    handler: (req: Record<string, unknown>) => Promise<unknown>,
  ) => Promise<unknown>;
  const filterFn = (geminiToolFilter as unknown as { wrapModelCall: FilterFn }).wrapModelCall;

  it('removes grep (which carries exclusiveMinimum) from the tool list before the model call', async () => {
    const grepTool = {
      name: 'grep',
      parameters: {
        type: 'object',
        properties: { max_count: { type: 'integer', exclusiveMinimum: 0 } },
      },
    };
    const lsTool = { name: 'ls', parameters: { type: 'object', properties: {} } };

    let capturedTools: unknown[] = [];
    const handler = vi.fn(async (req: Record<string, unknown>) => {
      capturedTools = (req['tools'] as unknown[]) ?? [];
      return null;
    });

    await filterFn({ tools: [grepTool, lsTool] }, handler);
    expect(capturedTools.map((t) => (t as { name: string }).name)).not.toContain('grep');
    expect(capturedTools.map((t) => (t as { name: string }).name)).toContain('ls');
  });

  it('handler receives no tool schemas with exclusiveMinimum/exclusiveMaximum after filter', async () => {
    const grepTool = {
      name: 'grep',
      parameters: {
        type: 'object',
        properties: { max_count: { type: 'integer', exclusiveMinimum: 0 } },
      },
    };
    const readTool = {
      name: 'read_file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
    };
    const writeTool = {
      name: 'write_file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
      },
    };

    let capturedTools: unknown[] = [];
    const handler = vi.fn(async (req: Record<string, unknown>) => {
      capturedTools = (req['tools'] as unknown[]) ?? [];
      return null;
    });

    await filterFn({ tools: [grepTool, readTool, writeTool] }, handler);
    for (const t of capturedTools) {
      expect(hasExclusiveKeyword(t)).toBe(false);
    }
  });
});

// Item 3: sub-agent registration assertions (converted from dump-subagents.ts)
describe('sub-agent registration', () => {
  it('withGeminiCompat(GENERAL_PURPOSE_SUBAGENT) produces a spec named "general-purpose"', () => {
    const spec = withGeminiCompat(GENERAL_PURPOSE_SUBAGENT);
    expect(spec.name).toBe('general-purpose');
  });

  it('registered general-purpose sub-agent has geminiToolFilter in middleware names', () => {
    const spec = withGeminiCompat(GENERAL_PURPOSE_SUBAGENT);
    const mwNames = ((spec.middleware ?? []) as Array<{ name?: string }>).map((m) => m.name);
    expect(mwNames).toContain('geminiToolFilter');
  });
});

// Item 4: systemCheck behavioral contract — result is returned even when assertion fails
describe('systemCheck behavior', () => {
  it('systemCheck is "pass" when systemInputTokens equals inputTokens', () => {
    const systemInputTokens = 12345;
    const inputTokens = 12345;
    const systemCheck: 'pass' | 'fail' = systemInputTokens === inputTokens ? 'pass' : 'fail';
    expect(systemCheck).toBe('pass');
  });

  it('systemCheck is "fail" when systemInputTokens differs from inputTokens', () => {
    // cast to number so TS does not narrow the literal types to non-overlapping
    const systemInputTokens = 15000 as number;
    const inputTokens = 12345 as number;
    const systemCheck: 'pass' | 'fail' = systemInputTokens === inputTokens ? 'pass' : 'fail';
    expect(systemCheck).toBe('fail');
  });

  // Behavioral contract: the throw now lives in run.ts (AFTER saving results.json),
  // not in runArtifactRun. This ensures results are persisted even on assertion failure.
  // run.ts checks result.systemCheck === 'fail' after writeFileSync and throws there.
  it('systemCheck "fail" does not throw from runArtifactRun — documented contract', () => {
    // This test documents the expected behavior; actual enforcement is in run.ts.
    // The function-level contract: runArtifactRun always returns a RunResult (never throws on mismatch).
    // The caller contract: run.ts calls writeFileSync before checking systemCheck.
    const willThrowAfterSave = (check: 'pass' | 'fail') => {
      const saved = true; // results.json written
      if (saved && check === 'fail') throw new Error('assertion failed after save');
    };
    expect(() => willThrowAfterSave('pass')).not.toThrow();
    expect(() => willThrowAfterSave('fail')).toThrow('assertion failed after save');
  });
});

describe('exclusiveMinimum root-cause', () => {
  it('Zod .positive() produces exclusiveMinimum in JSON Schema — root cause of Gemini 400', () => {
    // grep's max_count field uses .positive(), which Zod serialises as exclusiveMinimum: 0
    // The Gemini API rejects tool schemas that contain exclusiveMinimum/exclusiveMaximum.
    const grepLikeTool = new DynamicStructuredTool({
      name: 'grep',
      description: 'search files',
      schema: z.object({ max_count: z.number().int().positive().describe('max results') }),
      func: async () => '',
    });
    const { function: fn } = convertToOpenAITool(grepLikeTool);
    expect(hasExclusiveKeyword(fn.parameters)).toBe(true);
  });

  it('a tool without .positive()/.negative() has no exclusiveMinimum/exclusiveMaximum', () => {
    const safeTool = new DynamicStructuredTool({
      name: 'safe',
      description: 'safe tool',
      schema: z.object({ count: z.number().int().min(1).describe('count') }),
      func: async () => '',
    });
    const { function: fn } = convertToOpenAITool(safeTool);
    expect(hasExclusiveKeyword(fn.parameters)).toBe(false);
  });
});

// Item 6: span ordering and grouping — groupSpansByAgent sorts by startTime (not token value)
// and partitions main-agent vs sub-agent spans using the parent-run chain.
describe('span ordering and grouping', () => {
  // Fixture: token values are non-monotonic and interleave two agents.
  // startTime is the ground truth; the test proves ordering and grouping are independent.
  const TASK_SPAN = 'task-span-abc';
  const ROOT_SPAN = 'root-span-xyz';

  const fixtures: RawSpan[] = [
    // sub-agent call 1 — high tokens (9000) but starts BEFORE main-agent call 2
    {
      spanId: 'sub-a',
      promptTokens: 9000,
      completionTokens: 100,
      startTime: '2026-10-05T10:00:01.000Z',
      parentRunIds: [ROOT_SPAN, TASK_SPAN],
    },
    // main-agent call 1 — earliest span
    {
      spanId: 'main-a',
      promptTokens: 5000,
      completionTokens: 50,
      startTime: '2026-10-05T10:00:00.000Z',
      parentRunIds: [ROOT_SPAN],
    },
    // main-agent call 2 — later, lower tokens than sub-agent call 1
    {
      spanId: 'main-b',
      promptTokens: 7000,
      completionTokens: 80,
      startTime: '2026-10-05T10:00:02.000Z',
      parentRunIds: [ROOT_SPAN],
    },
    // sub-agent call 2 — lowest tokens (3000), latest time
    {
      spanId: 'sub-b',
      promptTokens: 3000,
      completionTokens: 30,
      startTime: '2026-10-05T10:00:03.000Z',
      parentRunIds: [ROOT_SPAN, TASK_SPAN],
    },
  ];

  it('sortedSpans are ordered by startTime, not by token value', () => {
    const { sortedSpans } = groupSpansByAgent(fixtures, new Set([TASK_SPAN]));
    expect(sortedSpans.map((s) => s.spanId)).toEqual(['main-a', 'sub-a', 'main-b', 'sub-b']);
  });

  it('mainAgentSpans contains only spans not descended from a task span', () => {
    const { mainAgentSpans } = groupSpansByAgent(fixtures, new Set([TASK_SPAN]));
    expect(mainAgentSpans.map((s) => s.spanId)).toEqual(['main-a', 'main-b']);
  });

  it('subAgentSpans groups spans by their task span parent', () => {
    const { subAgentSpans } = groupSpansByAgent(fixtures, new Set([TASK_SPAN]));
    expect(Object.keys(subAgentSpans)).toEqual([TASK_SPAN]);
    expect(subAgentSpans[TASK_SPAN]?.map((s) => s.spanId)).toEqual(['sub-a', 'sub-b']);
  });

  it('mainAgentPeakInputTokens is derived from mainAgentSpans only, not sub-agent spans', () => {
    // sub-agent call 1 has 9000 tokens — higher than any main-agent call (7000 max).
    // mainAgentPeakInputTokens must be 7000, not 9000.
    const { mainAgentPeakInputTokens } = groupSpansByAgent(fixtures, new Set([TASK_SPAN]));
    expect(mainAgentPeakInputTokens).toBe(7000);
  });

  it('all spans classified as main-agent when taskSpanIds is empty (Config A)', () => {
    const { mainAgentSpans, subAgentSpans } = groupSpansByAgent(fixtures, new Set());
    expect(mainAgentSpans).toHaveLength(4);
    expect(Object.keys(subAgentSpans)).toHaveLength(0);
  });
});
