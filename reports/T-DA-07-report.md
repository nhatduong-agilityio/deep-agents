# Report: T-DA-07 — "Loses the Plot" Trace Analysis

**Date completed:** 2026-10-07

## What was done

Root-cause analysis of the T-DA-05 producer-agent failure (1/5 seeded flaws fixed across
3 critic rounds). Detailed experiment report written to `reports/trace-analysis.md`.

**Files created:**

- `results/trace-analysis/pre-registration.json` — pre-registration written before any experiment run; baseline metric (1/5), gate (≥3/5), two pre-registered failure modes
- `src/experiments/critique/feedback-coverage.ts` — `RevisionGateMiddleware` + `countNumberedItems` + `parseDraftVersion` pure helpers; exported for testing
- `src/experiments/trace-analysis/run.ts` — fix experiment orchestrator; runs supervisor loop with gate; captures per-span token data; saves `results/trace-analysis/results.json`
- `src/__tests__/feedback-coverage.test.ts` — 12 unit tests (all passing)
- `docs/decisions/DDR-014-deepagents-vs-langgraph.md` — when DeepAgents overhead is justified vs plain LangGraph
- `reports/trace-analysis.md` — detailed experiment report with failure point analysis, per-span token table, before/after numbers, and lessons learned

**Commands run:**

```
npx tsx --env-file=.env src/experiments/trace-analysis/run.ts
pnpm typecheck   # clean
pnpm test        # 97/97 passing
pnpm lint        # clean
```

## Concepts covered

- **Agent Observability & Tracing (AOT) pattern:** Failure points are described by span name → tool called → expected vs actual outcome. Per-span token counts extracted from `AIMessage.usage_metadata` synchronously at invoke time — more reliable than LangSmith span queries, which are asynchronously indexed (T-DA-04 finding).

- **wrapToolCall vs wrapModelCall boundary:** `wrapToolCall` fires after the model has already decided its action; it can block individual calls but cannot change the model's plan for the current generation turn. `wrapModelCall` fires before the model generates, allowing context injection that changes the generation. The core lesson from FP3: if you need behavioral enforcement, inject context before model call.

- **Pre-registration discipline:** Writing `results/trace-analysis/pre-registration.json` (16:03) before running the experiment (results.json at 16:07) ensures the gate threshold and failure modes are defined before observing results. Gate FAIL is a valid and expected output type, not a failure of the task.

- **Blast-Radius Containment (BRC) extended:** `RevisionGateMiddleware` extends BRC from filesystem path rules to content-structure rules — blocking writes until the revision notes structurally cover all feedback items.

## Decisions and reasons

**Testing via pure helper functions rather than middleware wiring.** `createMiddleware` internals are deepagents-private and not unit-testable without a real agent run. The gate logic was extracted into `countNumberedItems`, `parseDraftVersion`, and the filesystem reads — all testable in isolation. The middleware `wrapToolCall` is thin glue around these functions.

**Gate FAIL reported honestly.** The gate fired correctly (4 blocks, all with `revisionItems=0, feedbackItems=7`) but did not improve fix rate. The report documents the root cause: model batches `write_file` calls in a single AIMessage turn; a per-tool gate cannot interrupt the plan. The correct fix is a `wrapModelCall` context injection, deferred to T-DA-08 harness patch.

**DDR-014 written** — `docs/decisions/DDR-014-deepagents-vs-langgraph.md`. Decision: use DeepAgents when ≥1 of: multiple sub-agents, filesystem isolation, context isolation as goal, or harness measurement. Empirical evidence: 15× baseline token overhead (T-DA-01), CIP ratio 0.3286 (T-DA-04), 5-line permission setup vs ~100-line LangGraph equivalent.

## Evidence of completion

**Fix experiment output:**

```
T-DA-07 — "Loses the Plot" Trace Analysis
Model: gpt-5.4-mini-2026-03-17 | max 3 critic rounds
Known flaws seeded: 5
Baseline (T-DA-05): 1/5 flaws fixed

=== Run 1: Fix (RevisionGateMiddleware enabled) ===

[fix] done — 1/5 flaws fixed
  gate blocks: 4
  critic rounds: 1
  langsmith run: 8f2ff0f1-6dfb-46c2-841d-f7c29e3b54c8
  round 1: feedback=7 revision=0 gateBlocked=true flawsFixed=1 precision=1.000 tokens=4156+104

Gate: FAIL — 1/5 flaws fixed (threshold: ≥3)
```

**LangSmith run ID:** `8f2ff0f1-6dfb-46c2-841d-f7c29e3b54c8`

**Test suite:**

```
Test Files  11 passed (11)
     Tests  97 passed (97)
```

**Output files:**

- `results/trace-analysis/pre-registration.json`
- `results/trace-analysis/results.json`
- `reports/trace-analysis.md` (detailed analysis)
- `docs/decisions/DDR-014-deepagents-vs-langgraph.md`

## Gotchas / lessons learned

1. **wrapToolCall is too late for plan enforcement.** When the model generates multiple tool calls in a single AIMessage turn (e.g. `[write_file(draft), write_file(notes)]`), blocking `write_file(draft)` causes a retry loop — the model re-emits the same draft write in the next turn without inserting the notes write. The enforcement window is the model call, not the tool call.

2. **Gate FAIL reveals the correct next fix.** The `RevisionGateMiddleware` proved the failure mode exists and correctly diagnosed FP3. The recommended follow-up is a `wrapModelCall` middleware that prepends a synthetic coverage-status ToolMessage before each model call, listing uncovered feedback items. This changes the generation, not just the post-generation execution.

3. **Pre-registration timestamps matter.** The file creation timestamps (`pre-registration.json` at 16:03, `results.json` at 16:07) provide audit evidence that the gate threshold was set before observing results — a necessary property for the measurement to be credible.
