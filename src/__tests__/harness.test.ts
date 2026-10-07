import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import { checkSolution } from '../../benchmark/subset/checker.js';
import { PROBLEMS } from '../../benchmark/subset/problems.js';
import { pruneOldToolResults } from '../experiments/harness/context-pruning.js';

const p01 = PROBLEMS.find((p) => p.id === 'p01')!;
const p17 = PROBLEMS.find((p) => p.id === 'p17')!;

describe('checkSolution', () => {
  it('passes all test cases for a correct numDecodings implementation', () => {
    // DP: dp[i] = ways to decode s[0..i-1]
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
    const result = checkSolution(code, p01);
    expect(result.passed).toBe(result.total);
    expect(result.errors).toHaveLength(0);
  });

  it('fails test cases for an incorrect implementation', () => {
    // Always returns 1 — wrong for multi-way cases
    const code = `return 1;`;
    const result = checkSolution(code, p01);
    expect(result.passed).toBeLessThan(result.total);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('handles syntax errors gracefully without throwing', () => {
    const code = `return {{{broken syntax`;
    const result = checkSolution(code, p01);
    expect(result.passed).toBe(0);
    expect(result.errors[0]).toMatch(/SyntaxError/i);
  });

  it('handles runtime errors gracefully without throwing', () => {
    const code = `return nums.nonExistentMethod();`;
    const result = checkSolution(code, p01);
    expect(result.passed).toBe(0);
    expect(result.errors[0]).toMatch(/threw/i);
  });

  it('does not let in-place mutation leak between test cases (rotate problem)', () => {
    const p18 = PROBLEMS.find((p) => p.id === 'p18')!;
    // Correct rotate implementation
    const code = `
      const n = nums.length;
      const steps = ((k % n) + n) % n;
      const rotated = [...nums.slice(n - steps), ...nums.slice(0, n - steps)];
      for (let i = 0; i < n; i++) nums[i] = rotated[i];
      return nums;
    `;
    const result = checkSolution(code, p18);
    expect(result.passed).toBe(result.total);
  });

  it('passes all test cases for a correct maxSubArray (Kadane)', () => {
    const code = `
      let maxSum = nums[0], cur = nums[0];
      for (let i = 1; i < nums.length; i++) {
        cur = Math.max(nums[i], cur + nums[i]);
        maxSum = Math.max(maxSum, cur);
      }
      return maxSum;
    `;
    const result = checkSolution(code, p17);
    expect(result.passed).toBe(result.total);
  });
});

describe('pruneOldToolResults', () => {
  function makeMessages() {
    const sys = new SystemMessage('system');
    const human = new HumanMessage('question');
    // Pair 1 (old)
    const ai1 = new AIMessage({
      content: '',
      tool_calls: [
        { name: 'think', args: { thought: 'thinking...' }, id: 'tc1', type: 'tool_call' },
      ],
    });
    const tool1 = new ToolMessage({ content: 'ack', tool_call_id: 'tc1' });
    // Pair 2 (recent)
    const ai2 = new AIMessage({
      content: '',
      tool_calls: [
        { name: 'think', args: { thought: 'more thinking' }, id: 'tc2', type: 'tool_call' },
      ],
    });
    const tool2 = new ToolMessage({ content: 'ack2', tool_call_id: 'tc2' });
    const aiFinal = new AIMessage({ content: 'final answer' });
    return [sys, human, ai1, tool1, ai2, tool2, aiFinal];
  }

  it('removes old ToolMessages when keepLastN=1', () => {
    const messages = makeMessages();
    const { pruned, stats } = pruneOldToolResults(messages, 1);
    // tool1 should be removed; tool2 should remain
    const toolMessages = pruned.filter((m) => m instanceof ToolMessage);
    expect(toolMessages).toHaveLength(1);
    expect((toolMessages[0] as ToolMessage).tool_call_id).toBe('tc2');
    expect(stats.messagesAfter).toBeLessThan(stats.messagesBefore);
  });

  it('keeps all ToolMessages when keepLastN >= number of pairs', () => {
    const messages = makeMessages();
    const { pruned } = pruneOldToolResults(messages, 5);
    const toolMessages = pruned.filter((m) => m instanceof ToolMessage);
    expect(toolMessages).toHaveLength(2);
  });

  it('always preserves HumanMessages and SystemMessages', () => {
    const messages = makeMessages();
    const { pruned } = pruneOldToolResults(messages, 0);
    expect(pruned.some((m) => m instanceof SystemMessage)).toBe(true);
    expect(pruned.some((m) => m instanceof HumanMessage)).toBe(true);
  });
});
