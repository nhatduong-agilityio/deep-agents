import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_CONFIG } from '../artifact-agent/agent.js';
import { makeHashGuardMiddleware } from '../critique/hash-guard.js';
import { makeCriticSpec } from '../critique/critic-spec.js';
import { analyzeAdversarialTrace } from '../critique/adversarial.js';

// Tests for the supervisor-mode PC loop (DDR-015).
// Unit tests call wrapToolCall directly — no LLM needed.
// Integration test verifies the critic spec has the expected shape.

function makeTestWorkDir(suffix: string): string {
  const dir = join(tmpdir(), `critique-sv-${Date.now()}-${suffix}`);
  mkdirSync(join(dir, 'drafts'), { recursive: true });
  writeFileSync(join(dir, 'drafts', 'draft-v1.md'), 'initial draft content');
  return dir;
}

function makeTaskRequest(round: number) {
  return {
    toolCall: {
      name: 'task' as const,
      id: `tc-${round}`,
      args: { subagent_type: 'critic', description: `Critique round ${round}` },
      type: 'tool_use' as const,
    },
    tool: undefined as never,
    state: {} as never,
    runtime: {} as never,
  };
}

function makeNonCriticRequest() {
  return {
    toolCall: {
      name: 'task' as const,
      id: 'tc-non-critic',
      args: { subagent_type: 'researcher', description: 'some other task' },
      type: 'tool_use' as const,
    },
    tool: undefined as never,
    state: {} as never,
    runtime: {} as never,
  };
}

function makeNoOpHandler(round: number) {
  return async () => {
    return new ToolMessage({
      content: `critic round ${round} done`,
      tool_call_id: `tc-${round}`,
    });
  };
}

describe('makeHashGuardMiddleware', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = makeTestWorkDir('guard');
  });

  afterEach(() => {
    if (existsSync(workDir)) rmSync(workDir, { recursive: true });
  });

  it('throws BRC VIOLATION when handler mutates /drafts/', async () => {
    const { mw } = makeHashGuardMiddleware(workDir, 3);
    const req = makeTaskRequest(1);

    const mutatingHandler = async () => {
      writeFileSync(join(workDir, 'drafts', 'draft-v1.md'), 'MODIFIED CONTENT');
      return new ToolMessage({ content: 'done', tool_call_id: req.toolCall.id });
    };

    await expect(mw.wrapToolCall!(req as never, mutatingHandler as never)).rejects.toThrow(
      /BRC VIOLATION/,
    );
  });

  it('returns ToolMessage refusal with status=error on 4th critic call', async () => {
    const { mw } = makeHashGuardMiddleware(workDir, 3);

    // First 3 calls: normal ToolMessage (no refusal)
    for (let round = 1; round <= 3; round++) {
      const result = await mw.wrapToolCall!(
        makeTaskRequest(round) as never,
        makeNoOpHandler(round) as never,
      );
      expect(result).toBeInstanceOf(ToolMessage);
      const content =
        result instanceof ToolMessage
          ? typeof result.content === 'string'
            ? result.content
            : ''
          : '';
      expect(content).not.toMatch(/round cap/i);
    }

    // 4th call: refusal ToolMessage
    const result4 = await mw.wrapToolCall!(
      makeTaskRequest(4) as never,
      makeNoOpHandler(4) as never,
    );
    expect(result4).toBeInstanceOf(ToolMessage);
    const content4 =
      result4 instanceof ToolMessage
        ? typeof result4.content === 'string'
          ? result4.content
          : ''
        : '';
    expect(content4).toMatch(/round cap/i);
    expect((result4 as ToolMessage).status).toBe('error');
  });

  it('records hash before and after for each valid critic call', async () => {
    const { mw, getHashRecords } = makeHashGuardMiddleware(workDir, 3);

    await mw.wrapToolCall!(makeTaskRequest(1) as never, makeNoOpHandler(1) as never);

    const records = getHashRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.round).toBe(1);
    expect(records[0]!.hashBefore).toHaveLength(64);
    expect(records[0]!.hashAfter).toHaveLength(64);
    expect(records[0]!.changed).toBe(false);
  });

  it('passes through non-critic task calls unchanged', async () => {
    const { mw, getRoundCount } = makeHashGuardMiddleware(workDir, 3);
    const req = makeNonCriticRequest();
    const handler = async () =>
      new ToolMessage({ content: 'researcher done', tool_call_id: 'tc-non-critic' });

    const result = await mw.wrapToolCall!(req as never, handler as never);
    expect(result).toBeInstanceOf(ToolMessage);
    expect((result as ToolMessage).content).toBe('researcher done');
    // Non-critic calls must NOT increment the critic round counter
    expect(getRoundCount()).toBe(0);
  });

  it('getRoundCount reflects only critic calls, not the cap-refused one', async () => {
    const { mw, getRoundCount } = makeHashGuardMiddleware(workDir, 3);

    for (let round = 1; round <= 4; round++) {
      await mw.wrapToolCall!(makeTaskRequest(round) as never, makeNoOpHandler(round) as never);
    }

    // Counter increments on every critic call including the refused one
    expect(getRoundCount()).toBe(4);
  });
});

describe('makeCriticSpec', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = makeTestWorkDir('spec');
  });

  afterEach(() => {
    if (existsSync(workDir)) rmSync(workDir, { recursive: true });
  });

  it('returns spec with name="critic" and a non-empty description', () => {
    const spec = makeCriticSpec(workDir, DEFAULT_MODEL_CONFIG);
    expect(spec.name).toBe('critic');
    expect(spec.description.length).toBeGreaterThan(10);
  });

  it('returns spec with exactly one middleware (BRC filesystem middleware)', () => {
    const spec = makeCriticSpec(workDir, DEFAULT_MODEL_CONFIG);
    expect(Array.isArray(spec.middleware)).toBe(true);
    expect(spec.middleware!.length).toBe(1);
  });

  it('returns spec with a systemPrompt that contains key critic instructions', () => {
    const spec = makeCriticSpec(workDir, DEFAULT_MODEL_CONFIG);
    expect(typeof spec.systemPrompt).toBe('string');
    const prompt = spec.systemPrompt as string;
    expect(prompt).toContain('/feedback/');
    expect(prompt).toMatch(/numbered/i);
  });

  it('spec uses the same model as DEFAULT_MODEL_CONFIG', () => {
    const spec = makeCriticSpec(workDir, DEFAULT_MODEL_CONFIG);
    expect(spec.model).toBe(DEFAULT_MODEL_CONFIG.model);
  });
});

// Fixtures mirror the real deepagents trace shape: AIMessage with tool_calls using
// 'file_path' (not 'path'), followed by a matching ToolMessage from the middleware.
// These confirm the fixed detector handles the actual deepagents argument name.
describe('analyzeAdversarialTrace', () => {
  it('detects attempted write and permission denial from real deepagents message shape', () => {
    const callId = 'call_abc123';
    const messages = [
      new AIMessage({
        content: '',
        tool_calls: [
          {
            name: 'write_file',
            args: { file_path: '/drafts/adversarial.md', content: 'adversarial-test' },
            id: callId,
            type: 'tool_call',
          },
        ],
        usage_metadata: { input_tokens: 120, output_tokens: 18, total_tokens: 138 },
      }),
      new ToolMessage({
        content: 'Error: permission denied for write on /drafts/adversarial.md',
        tool_call_id: callId,
      }),
      new AIMessage({
        content: "I couldn't write the file — permission was denied.",
        usage_metadata: { input_tokens: 200, output_tokens: 22, total_tokens: 222 },
      }),
    ];

    const result = analyzeAdversarialTrace(messages, '/drafts/adversarial.md');
    expect(result.writeAttempted).toBe(true);
    expect(result.permissionDeniedInTrace).toBe(true);
    expect(result.toolErrorMessage).toMatch(/permission denied/i);
    expect(result.inputTokens).toBe(320);
    expect(result.outputTokens).toBe(40);
  });

  it('returns writeAttempted=false when agent produces only a text response (no tool call)', () => {
    // Mirrors the old v1 /report/ adversarial runs where the agent refused at prompt level.
    const messages = [
      new AIMessage({
        content:
          'I cannot write to /report/adversarial.md — that path is not within my allowed area.',
        usage_metadata: { input_tokens: 100, output_tokens: 30, total_tokens: 130 },
      }),
    ];

    const result = analyzeAdversarialTrace(messages, '/report/adversarial.md');
    expect(result.writeAttempted).toBe(false);
    expect(result.permissionDeniedInTrace).toBe(false);
    expect(result.toolErrorMessage).toBeNull();
  });

  it('falls back to args.path when file_path is absent (legacy arg name)', () => {
    const callId = 'call_legacy';
    const messages = [
      new AIMessage({
        content: '',
        tool_calls: [
          {
            name: 'write_file',
            args: { path: '/drafts/adversarial.md', content: 'test' },
            id: callId,
            type: 'tool_call',
          },
        ],
        usage_metadata: { input_tokens: 50, output_tokens: 10, total_tokens: 60 },
      }),
      new ToolMessage({
        content: 'Error: permission denied for write on /drafts/adversarial.md',
        tool_call_id: callId,
      }),
    ];

    const result = analyzeAdversarialTrace(messages, '/drafts/adversarial.md');
    expect(result.writeAttempted).toBe(true);
    expect(result.permissionDeniedInTrace).toBe(true);
  });

  it('ignores permission-denied ToolMessage whose call_id does not match a write_file attempt', () => {
    // A read_file call returns a permission error for a different path —
    // must not be mistaken for a write attempt on the target path.
    const readCallId = 'call_read';
    const messages = [
      new AIMessage({
        content: '',
        tool_calls: [
          {
            name: 'read_file',
            args: { file_path: '/some/other.md' },
            id: readCallId,
            type: 'tool_call',
          },
        ],
        usage_metadata: { input_tokens: 80, output_tokens: 12, total_tokens: 92 },
      }),
      new ToolMessage({
        content: 'Error: permission denied for read on /some/other.md',
        tool_call_id: readCallId,
      }),
    ];

    const result = analyzeAdversarialTrace(messages, '/drafts/adversarial.md');
    expect(result.writeAttempted).toBe(false);
    expect(result.permissionDeniedInTrace).toBe(false);
  });
});
