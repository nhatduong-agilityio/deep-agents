import { describe, expect, it } from 'vitest';
import { RunCounter } from '../lib/counter.js';

describe('RunCounter', () => {
  it('starts at zero for all dimensions', () => {
    const c = new RunCounter();
    const s = c.snapshot();
    expect(s.tokens.input).toBe(0);
    expect(s.tokens.output).toBe(0);
    expect(s.estimatedCostUsd).toBe(0);
    expect(s.toolCallCount).toBe(0);
    expect(s.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('accumulates tokens and computes cost', () => {
    const c = new RunCounter();
    c.addTokens(1_000_000, 0);
    const s = c.snapshot();
    expect(s.tokens.input).toBe(1_000_000);
    expect(s.estimatedCostUsd).toBeCloseTo(0.075);
  });

  it('accumulates output tokens at higher rate', () => {
    const c = new RunCounter();
    c.addTokens(0, 1_000_000);
    expect(c.snapshot().estimatedCostUsd).toBeCloseTo(0.3);
  });

  it('increments tool call count', () => {
    const c = new RunCounter();
    c.incrementToolCall();
    c.incrementToolCall();
    expect(c.snapshot().toolCallCount).toBe(2);
  });

  it('checkBudget passes when within limits', () => {
    const c = new RunCounter({ maxTokens: 1000, maxToolCalls: 10 });
    c.addTokens(100, 50);
    c.incrementToolCall();
    expect(() => c.checkBudget()).not.toThrow();
  });

  it('checkBudget throws when token limit exceeded', () => {
    const c = new RunCounter({ maxTokens: 100 });
    c.addTokens(101, 0);
    expect(() => c.checkBudget()).toThrow(/tokens/);
  });

  it('checkBudget throws when cost limit exceeded', () => {
    const c = new RunCounter({ maxCostUsd: 0.001 });
    c.addTokens(1_000_000, 0);
    expect(() => c.checkBudget()).toThrow(/cost/);
  });

  it('checkBudget throws when tool call limit exceeded', () => {
    const c = new RunCounter({ maxToolCalls: 3 });
    c.incrementToolCall();
    c.incrementToolCall();
    c.incrementToolCall();
    c.incrementToolCall();
    expect(() => c.checkBudget()).toThrow(/tool calls/);
  });

  it('checkBudget throws when time limit exceeded', () => {
    // maxTimeMs: -1 → elapsedMs (≥0) > -1 is always true; no timer dependency
    const c = new RunCounter({ maxTimeMs: -1 });
    expect(() => c.checkBudget()).toThrow(/elapsed/);
  });
});
