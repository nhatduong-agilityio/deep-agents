# DDR-007: Planning Enforcement via System Prompt Instruction

**Date:** 2026-10-05
**Status:** Accepted

## Context

T-DA-02 required measuring whether `write_todos` is called as the first tool action in a multi-step agent run. Two mechanisms were available: (A) rely on the agent choosing to plan spontaneously, or (B) instruct it explicitly via the system prompt. The decision affects Output 2 (Planning Trace) and the PTR (Plan & TODO Recitation) pattern measurement.

Related: DDR-005 (measurement discipline — run counts, empirical evidence requirement).

## Options Considered

### Option A: No instruction (default agent behaviour)

Baseline condition: `todoListMiddleware()` present, no system prompt guidance.

- Pros: Measures natural agent behaviour; no prompt engineering required
- Cons: Agent never spontaneously calls `write_todos` (confirmed empirically); produces no planning trace

### Option B: Explicit system prompt instruction

Treatment condition: system prompt states "Before calling any other tool, you MUST call `write_todos` with a numbered list of ≤10 items covering your plan."

- Pros: Reliable, measurable, produces LangSmith trace with visible todo lifecycle; meets Output 2 DoD
- Cons: PTR token overhead is significant (~3.2× total tokens); instruction must be maintained across model updates

### Option C: Middleware-enforced planning (hide all tools until write_todos is called)

Hide all tools except `write_todos` for the first model step, then restore.

- Pros: Enforces planning without prompt text; no natural-language fragility
- Cons: Requires `wrapModelCall` middleware per-step state tracking; more complex; outside T-DA-02 scope

## Decision

**Option B** for T-DA-02. The explicit system prompt instruction reliably produces the planning trace required for Output 2. Option C is noted as a superior long-term pattern (see T-DA-06 harness drills) but is out of scope here.

The deciding criterion: Output 2 requires a LangSmith trace showing `write_todos` called first with todo status transitions. Option A produces no such trace (0/10 spontaneous rate). Option B produces it 10/10.

## Consequences

- **Easier:** Planning trace is deterministic and verifiable in LangSmith; todo lifecycle (pending→in_progress→completed) is visible in every treatment run
- **Harder:** Token cost increases ~3.2× vs no-plan baseline; PTR recitation is re-injected into context on every subsequent model call in the run
- **Technical debt:** The system prompt instruction is fragile under model changes — if a future model ignores the instruction, the first-call rate degrades silently. Option C (middleware enforcement) would eliminate this risk.

## Empirical evidence

`results/planning-first/results.json` — 20 runs (10 baseline + 10 treatment), `gemini-3.5-flash-lite`, 2026-10-05:

| Condition | write_todos first-call rate | Avg total tokens/run | Avg model calls/run |
| --------- | --------------------------- | -------------------- | ------------------- |
| Baseline  | **0/10**                    | ~14,100              | 3                   |
| Treatment | **10/10**                   | ~44,900              | 7                   |

PTR overhead: +30,818 tokens per run (~3.2× multiplier). The overhead comes from the todo list being included in the context of every subsequent model call in the run (7 calls × ~4,400 tokens each vs 3 calls × ~4,700 tokens each).
