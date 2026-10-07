# Report: T-DA-06 — Harness Optimization Drills

**Date completed:** 2026-10-07
**Corrected:** 2026-10-07 (oracle fix, framing corrections, token numbers)

## What was done

- Created `benchmark/subset/problems.ts` — 20-problem curated TypeScript algorithmic benchmark.
- Created `benchmark/subset/checker.ts` — `checkSolution` using `new Function()` for inline execution.
- Created `src/experiments/harness/harness-config.ts`, `context-pruning.ts`, `solver.ts`, `run.ts`.
- Created `src/__tests__/harness.test.ts` — 8 unit tests (checkSolution + pruneOldToolResults).
- Created `docs/decisions/DDR-009-benchmark-exec-env.md`.
- Ran experiment: 5 steps × 3 runs × 20 problems = 300 single model calls.
- Results written to `results/harness/results.json`.

**Benchmark changes (limitation):** The problem set was changed twice after initial runs revealed
ceiling effects. First, 5 canonical LeetCode problems were swapped for harder non-standard problems.
Then temperature was raised from 0 to 0.7. The selection criterion (≥20% baseline failure) was NOT
met even after these changes. This instability should be treated as a limitation of this run.

## Setup clarification

This is **not** a deep-agent harness measurement. There are no tools, no loops, no code execution
by the model, and `deepagents` is not invoked. Each of the 300 calls is a single
System+Human→AIMessage exchange. The "harness steps" are five prompt engineering variants applied
to a direct `ChatOpenAI.invoke()` call. The `deepagents_version` field in `results.json` is not
meaningful for this experiment.

## Concepts covered

- **Single-call prompt variants:** Five prompt structures (baseline, THINK:/SOLUTION:, context-prune,
  pre-completion checklist, PLAN:/SOLUTION: ReWOO) measure whether structured prompting changes
  accuracy or cost on a coding benchmark.
- **Ceiling effect:** When a model is already at or near 100%, prompt improvements are invisible —
  there is no headroom for improvement, and no degradation signal either. Harness patterns are only
  differentiable in the sub-80% accuracy range.
- **CETC (Tool-Result Clearing):** Context pruning removes old ToolMessages before each model call.
  In a single-call setup (no tool history), this is **not measurable** — there are no ToolMessages
  to prune and token counts are identical to baseline. CETC only has effect in multi-turn agentic
  loops where ToolMessages accumulate.
- **Oracle correctness:** A benchmark is only as valid as its expected values. p06 had a wrong
  oracle (expected=1 for an input where the correct answer is 2). All systematic "failures" on p06
  were the model being right.

## Decisions and reasons

- **`new Function()` for execution** — see DDR-009. Synchronous, zero overhead.
- **temperature=0.7** — temperature=0 gave 100% across all problems including harder replacements.
  0.7 introduces generation variance. Despite this, baseline remains at 100% after oracle fix.
  Documented in DDR-009.
- **`deepagents_version` in results.json is misleading** — the harness doesn't use deepagents.
  Field retained to avoid JSON schema break but marked N/A in interpretation.
- **No LangSmith run IDs recorded per step/run** — the run script does not log trace IDs to the
  output file. This is a gap; future runs should log `tracer.currentRunId()` per problem call.

## Evidence of completion

### Oracle verification (independent reference implementations — 2026-10-07)

All 20 problems verified against hand-written reference implementations. One oracle error found:

| Problem    | Test case                    | Stored expected | Reference expected | Status    |
| ---------- | ---------------------------- | --------------- | ------------------ | --------- |
| p06 (jump) | `[10,9,8,7,6,5,4,3,2,1,1,0]` | 1               | **2**              | **FIXED** |

From index 0, `nums[0]=10` reaches at most index 10; last index is 11; minimum 2 jumps. Model
was correct all along. Benchmark file updated: `expected: 1` → `expected: 2`.

All other 93 test cases correct.

### Corrected pass rate table (3 runs each step, 20 problems, 94 test cases per run)

| Step            | Corrected Avg Pass% | Per-run      | Avg Cost/Run | Avg Input Tokens/Prob   |
| --------------- | ------------------- | ------------ | ------------ | ----------------------- |
| baseline        | **100.0%**          | 100/100/100  | $0.0124      | 156.65                  |
| think           | **100.0%**          | 100/100/100  | $0.0216      | 217.65 (+39%)           |
| context-pruning | **100.0%**          | 100/100/100  | $0.0124      | 156.65 (not measurable) |
| checklist       | **99.6%**           | 100/98.9/100 | $0.0144      | 222.65                  |
| rewoo           | **100.0%**          | 100/100/100  | $0.0163      | 211.65 (+35%)           |

All steps are at ceiling. The one checklist miss (p12 uniquePaths, 1 failure in run 2) is noise
at n=3 — not a reliable finding.

### Token cost analysis (vs baseline)

| Step            | Input token overhead | Cost overhead | Interpretation                                          |
| --------------- | -------------------- | ------------- | ------------------------------------------------------- |
| think           | +39% (61 tok/prob)   | +75%          | THINK: prefix generates reasoning text before SOLUTION: |
| context-pruning | 0%                   | 0%            | Not measurable — no ToolMessages to prune               |
| checklist       | +42% (66 tok/prob)   | +16%          | Checklist appended to user message; short responses     |
| rewoo           | +35% (55 tok/prob)   | +31%          | PLAN: prefix forces planning text before SOLUTION:      |

Think costs +75% because output tokens dominate (reasoning text is long). Checklist adds
input tokens but elicits shorter output (model follows the checklist structure tightly).

### Temperature confirmation (5 calls, minWindow problem)

```
run 1: hash=dec74ac77585  tokens_out=247
run 2: hash=6ebc93ed269f  tokens_out=280
run 3: hash=d84fd010e63f  tokens_out=290
run 4: hash=43c68a767dca  tokens_out=271
run 5: hash=f47e0de4da7f  tokens_out=284
Unique outputs: 5/5 — temperature > 0 is effective
```

5 distinct outputs confirm temperature=0.7 is being applied and accepted by the model.

LangSmith trace request-payload verification: not performed (LangSmith API query for request
parameters was not scripted). The output variance above is sufficient evidence that temperature
is non-zero; exact API payload confirmation is outstanding.

### Output files

- `results/harness/results.json` — raw data, 3,252 lines
- `benchmark/subset/problems.ts` — oracle corrected for p06

## Gotchas / lessons learned

- **Verify all oracles with an independent reference implementation before running.** A wrong
  expected value produces a "systematic failure" that looks like a model error. In this case,
  p06 failed every step every run because the oracle was wrong, not the model.
- **This experiment is single-call prompt engineering, not agent harness measurement.** Context
  pruning, loop detection, and BGA are agent-loop patterns that cannot be observed in a
  single-call benchmark. A v2 experiment with a looping agent and `run_tests` tool is needed.
- **The selection criterion (≥20% failure) was not met** even after replacing 5 problems and
  raising temperature. gpt-5.4-mini has memorized algorithmic problem patterns too deeply.
  Novel problems, a weaker model config, or a genuinely agent-loop task set is required.
- **LangSmith run IDs should be logged per problem.** Without them, trace-level debugging
  requires time-based lookup. Add `console.log(runId)` after each model call in v2.
