// Gemini Flash Lite pricing as of 2026-10 (USD per 1M tokens)
const COST_PER_1M_INPUT = 0.075;
const COST_PER_1M_OUTPUT = 0.3;

export interface BudgetLimits {
  maxTokens?: number;
  maxCostUsd?: number;
  maxTimeMs?: number;
  maxToolCalls?: number;
}

export interface RunSnapshot {
  tokens: { input: number; output: number };
  estimatedCostUsd: number;
  elapsedMs: number;
  toolCallCount: number;
}

export class RunCounter {
  private inputTokens = 0;
  private outputTokens = 0;
  private toolCallCount = 0;
  private readonly startMs: number;

  constructor(private readonly limits: BudgetLimits = {}) {
    this.startMs = Date.now();
  }

  addTokens(input: number, output: number): void {
    this.inputTokens += input;
    this.outputTokens += output;
  }

  incrementToolCall(): void {
    this.toolCallCount++;
  }

  snapshot(): RunSnapshot {
    return {
      tokens: { input: this.inputTokens, output: this.outputTokens },
      estimatedCostUsd:
        (this.inputTokens / 1_000_000) * COST_PER_1M_INPUT +
        (this.outputTokens / 1_000_000) * COST_PER_1M_OUTPUT,
      elapsedMs: Date.now() - this.startMs,
      toolCallCount: this.toolCallCount,
    };
  }

  // BGA pattern: call pre-step to abort before an irreversible action
  checkBudget(): void {
    const s = this.snapshot();
    const { maxTokens, maxCostUsd, maxTimeMs, maxToolCalls } = this.limits;

    if (maxTokens !== undefined && s.tokens.input + s.tokens.output > maxTokens)
      throw new Error(`Budget exceeded: tokens ${s.tokens.input + s.tokens.output} > ${maxTokens}`);
    if (maxCostUsd !== undefined && s.estimatedCostUsd > maxCostUsd)
      throw new Error(`Budget exceeded: cost $${s.estimatedCostUsd.toFixed(4)} > $${maxCostUsd}`);
    if (maxTimeMs !== undefined && s.elapsedMs > maxTimeMs)
      throw new Error(`Budget exceeded: elapsed ${s.elapsedMs}ms > ${maxTimeMs}ms`);
    if (maxToolCalls !== undefined && s.toolCallCount > maxToolCalls)
      throw new Error(`Budget exceeded: tool calls ${s.toolCallCount} > ${maxToolCalls}`);
  }
}
