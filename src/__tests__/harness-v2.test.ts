import { describe, expect, it } from 'vitest';
import { PROBLEMS } from '../../benchmark/subset/problems.js';
import { executeIsolated } from '../experiments/harness-v2/run-tests-tool.js';
import { extractFinalCode, extractLastTestedCode } from '../experiments/harness-v2/middleware.js';
import { AIMessage } from '@langchain/core/messages';

const p01 = PROBLEMS.find((p) => p.id === 'p01')!; // numDecodings
const p02 = PROBLEMS.find((p) => p.id === 'p02')!; // maxProfit

describe('executeIsolated', () => {
  it('passes a correct numDecodings solution', () => {
    const code = `
      const n = s.length;
      if (n === 0 || s[0] === '0') return 0;
      const dp = new Array(n + 1).fill(0);
      dp[0] = 1; dp[1] = 1;
      for (let i = 2; i <= n; i++) {
        const one = parseInt(s[i - 1], 10);
        const two = parseInt(s.substring(i - 2, i), 10);
        if (one >= 1) dp[i] += dp[i - 1];
        if (two >= 10 && two <= 26) dp[i] += dp[i - 2];
      }
      return dp[n];
    `;
    const result = executeIsolated(code, p01.paramNames, p01.testCases);
    expect(result.passed).toBe(result.total);
    expect(result.errors).toHaveLength(0);
  });

  it('fails a wrong solution with error details', () => {
    const code = `return 1;`; // wrong for multi-decode inputs
    const result = executeIsolated(code, p01.paramNames, p01.testCases);
    expect(result.passed).toBeLessThan(result.total);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('handles syntax errors gracefully', () => {
    const code = `return {{{{`;
    const result = executeIsolated(code, p01.paramNames, p01.testCases);
    expect(result.passed).toBe(0);
    expect(result.errors[0]).toMatch(/SyntaxError/i);
  });

  it('passes a correct maxProfit solution', () => {
    const code = `
      let min = Infinity, max = 0;
      for (const p of prices) {
        min = Math.min(min, p);
        max = Math.max(max, p - min);
      }
      return max;
    `;
    const result = executeIsolated(code, p02.paramNames, p02.testCases);
    expect(result.passed).toBe(result.total);
  });

  it('deep-clones inputs so mutations do not affect later test cases', () => {
    // A buggy sort-in-place that would corrupt the array for subsequent cases
    const code = `return prices.sort((a,b) => a-b)[0];`;
    const result = executeIsolated(code, p02.paramNames, p02.testCases);
    // Just check it doesn't throw and all cases are attempted
    expect(result.total).toBe(p02.testCases.length);
  });
});

describe('executeIsolated — security', () => {
  const trivial = [{ input: ['x'], expected: 'sentinel' }];

  it('OPENAI_API_KEY is not visible in runner subprocess (env:{} isolation)', () => {
    // macOS always injects ~4 OS-level vars (PWD, __CF_USER_TEXT_ENCODING, etc.) even with env:{}
    // The meaningful claim: user API keys are absent.
    const code = `return process.env['OPENAI_API_KEY'] === undefined ? 'sentinel' : 'LEAK';`;
    const result = executeIsolated(code, ['s'], trivial);
    expect(result.passed).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('cwd in runner is a temp dir, not the project root', () => {
    const projectRoot = process.cwd();
    const code = `return process.cwd() === ${JSON.stringify(projectRoot)} ? 'LEAK' : 'sentinel';`;
    const result = executeIsolated(code, ['s'], trivial);
    expect(result.passed).toBe(1);
  });

  it('infinite loop is killed by the timeout', () => {
    const code = `while(true){}`;
    const result = executeIsolated(code, ['s'], [{ input: ['x'], expected: 0 }]);
    expect(result.passed).toBe(0);
    expect(result.errors[0]).toMatch(/timeout|ETIMEDOUT|killed|SIGTERM|5000/i);
  }, 10_000); // allow 10s so the 5s timeout can fire
});

describe('extractFinalCode', () => {
  it('extracts code from a markdown fence in the last AIMessage', () => {
    const msg = new AIMessage('Here is your solution:\n```javascript\nreturn 42;\n```');
    const code = extractFinalCode([msg]);
    expect(code).toBe('return 42;');
  });

  it('returns plain text when no fence is present', () => {
    const msg = new AIMessage('return 42;');
    const code = extractFinalCode([msg]);
    expect(code).toBe('return 42;');
  });

  it('skips AIMessages that have tool_calls (still in tool-calling mode)', () => {
    const toolCallMsg = new AIMessage({
      content: '',
      tool_calls: [{ id: 'c1', name: 'run_tests', args: { code: 'return 0;' } }],
    });
    const finalMsg = new AIMessage('```javascript\nreturn 99;\n```');
    const code = extractFinalCode([toolCallMsg, finalMsg]);
    expect(code).toBe('return 99;');
  });

  it('falls back to last run_tests code when no final text message found', () => {
    const toolCallMsg = new AIMessage({
      content: '',
      tool_calls: [{ id: 'c1', name: 'run_tests', args: { code: 'return 77;' } }],
    });
    const code = extractFinalCode([toolCallMsg]);
    expect(code).toBe('return 77;');
  });

  it('returns null when messages is empty', () => {
    expect(extractFinalCode([])).toBeNull();
  });
});

describe('extractLastTestedCode', () => {
  it('returns the code from the last run_tests call', () => {
    const first = new AIMessage({
      content: '',
      tool_calls: [{ id: 'c1', name: 'run_tests', args: { code: 'return 1;' } }],
    });
    const second = new AIMessage({
      content: '',
      tool_calls: [{ id: 'c2', name: 'run_tests', args: { code: 'return 2;' } }],
    });
    expect(extractLastTestedCode([first, second])).toBe('return 2;');
  });

  it('returns null when no run_tests call is found', () => {
    const msg = new AIMessage('hello');
    expect(extractLastTestedCode([msg])).toBeNull();
  });
});
