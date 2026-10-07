# Report: T-DA-06 v2 — Deep-Agent Coding Benchmark

**Date completed:** 2026-10-07

## What was done

- Created `benchmark/runner.mjs` — code executor spawned via `child_process.execSync` with `env: {}`, `cwd: tmpDir`, and Node permission model.
- Created `src/experiments/harness-v2/` — config, run-tests-tool, middleware, agent, and orchestrator.
- Created `src/__tests__/harness-v2.test.ts` — 15 unit tests (all passing).
- Ran experiment: 5 steps × 3 runs × 20 problems = 300 deep-agent invocations.
- Results written to `results/harness-v2/results.json`.

**Difference from T-DA-06 v1:** Each problem is solved by a looping deep-agent with a `run_tests`
tool that executes code in a restricted subprocess. The agent can call `run_tests` multiple times,
inspect failures, and revise before answering. This is a genuine agent-loop measurement — not a
single-call prompt variant.

## Pre-registration gap (documented deviation)

The pre-registration file (`results/harness-v2/pre-registration.json`) lists hypotheses and
metrics but **does not define a precondition gate.** It does not contain any statement of the form
"baseline fails ≥20% on hidden tests before proceeding." The relevant fields are:

```json
"primary_metrics": [
  "hiddenPassRate (scored on test cases not shown to agent)",
  ...
],
"hypotheses": {
  "self_verification": "run_tests usage rate increases vs baseline; hidden pass rate equal or higher",
  ...
}
```

The ≥20% failure precondition was defined in the T-DA-06 task DoD (`docs/tasks.md`) but was not
carried into the pre-registration before running. **The precondition was not met in v1 or v2.**
The comparison table below is retained for documentation but carries no information about harness
effects — all steps are at ceiling.

**Lesson:** Run one baseline pass (1 run, all problems) before committing to the full matrix.
Check the precondition. Only proceed if baseline fails ≥20%.

## Hidden test coverage (limitation)

Hidden test case counts per problem (PUBLIC_TEST_COUNT=3):

| Problems                                         | Hidden cases | Notes                                               |
| ------------------------------------------------ | ------------ | --------------------------------------------------- |
| p01, p03                                         | 3            | adequate signal                                     |
| p04, p05, p06, p07, p08, p11, p14, p15, p17, p19 | 2            | moderate                                            |
| p02, p09, p10, p12, p13, p16, p20                | 1            | weak signal (1 sample)                              |
| **p18**                                          | **0**        | **no hidden tests; excluded from hidden pass rate** |

p18 (`maxDepth` / binary tree) had only 1 test case total. Its public test is the only test, and
it contributes 0 to the hidden pass rate numerator and denominator (excluded from the ratio).
For the 7 problems with 1 hidden case, a single test failure would register as 0% hidden pass —
but a single passing case gives no signal about generalization.

## Concepts covered

- **run_tests tool (CETC-adjacent):** The agent uses a tool to execute its own code and inspect
  results. This creates a feedback loop: test → observe failure → revise → retest. Unlike
  single-call CETC (which prunes stale ToolMessages), here the tool result is the signal for
  the _next_ action.
- **Restricted subprocess execution:** `runner.mjs` is spawned with `env: {}` (API keys absent),
  `cwd: tmpDir` (relative-path reads hit an empty dir), a 5000ms timeout, and — on Node ≥24 —
  the `--permission --allow-fs-read=<runner>` flag (absolute-path reads outside runner blocked by
  OS). This is **not a full sandbox**: no memory limit, no network restriction, no seccomp.
- **Public/hidden test split:** The agent sees only the first 3 test cases via `run_tests`;
  remaining cases are scored silently after submission.
- **Ceiling effect (again):** gpt-5.4-mini-2026-03-17 scores 100% public and hidden across all
  5 steps. The model solves every problem on the first `run_tests` call — no loops triggered,
  no retries. Middleware interventions had no measurable effect.
- **Baseline already self-verifies:** In baseline (no constraints), the agent called `run_tests`
  exactly once per problem in every run (avg_tools=1.00). The self-verification and pre-completion
  instructions are redundant — the model already verifies before answering.

## Decisions and reasons

- **`process.execPath` over `node`:** `env: {}` strips PATH; the absolute binary path is required.
- **`cwd: tmpDir` (fresh per invocation):** Relative-path reads in model code (e.g.
  `readFileSync('.env')`) hit an empty temp dir, not the project root. Temp dir is cleaned up in
  `finally`.
- **`--permission --allow-fs-read=<runner>`:** Node 24 permission model (stable; flag is
  `--permission`, not `--experimental-permission`). Restricts subprocess to reading only the
  runner script itself. macOS still injects ~4 OS-level vars (`PWD`, `__CF_USER_TEXT_ENCODING`,
  etc.) even with `env: {}`; API keys (`OPENAI_API_KEY`) are confirmed absent.

## Open items from T-DA-06 v1 review

### p06 oracle

Fixed in v1 (`expected: 1 → expected: 2` for `[10,9,8,7,6,5,4,3,2,1,1,0]`). All 20 problems
verified against independent reference implementations in `scripts/verify-oracles.mjs`; 19/20 were
correct before the fix, 20/20 after. This correction carries into v2 (same benchmark file).

### Temperature verification

The v1 review confirmed temperature=0.7 via a 5-call hash test (5 unique outputs). No actual API
request payload was inspected from a LangSmith trace — the payload content in the trace UI was not
captured. The output-variance test is sufficient evidence that temperature is non-zero, but exact
payload confirmation is outstanding.

### LangSmith run IDs for v2

**Not recorded.** The v2 `agent.ts` does not pass a `runId` or log the trace ID from
`agent.invoke()`. LangSmith auto-generates a trace per invocation, but the IDs are not captured
in `results/harness-v2/results.json`. This is a gap carried forward from v1. Future runs should
log `langsmithRunId` per problem using `crypto.randomUUID()` + `{ runId }` in the invoke options.

## Evidence of completion

### Comparison table — **uninformative (ceiling)**

All steps at 100% public and hidden. No harness effect is measurable at ceiling.

| Step              | PubPass% | HidPass% | Cost/run | Calls/prob | Tools/prob | Loops |
| ----------------- | -------- | -------- | -------- | ---------- | ---------- | ----- |
| baseline          | 100.0%   | 100.0%   | $0.0764  | 2.00       | 1.00       | 0     |
| self-verification | 100.0%   | 100.0%   | $0.0789  | 2.03       | 1.03       | 0     |
| pre-completion    | 100.0%   | 100.0%   | $0.0780  | 2.02       | 1.02       | 0     |
| loop-detection    | 100.0%   | 100.0%   | $0.0763  | 2.02       | 1.02       | 0     |
| context-pruning   | 100.0%   | 100.0%   | $0.0778  | 2.05       | 1.05       | 0     |

### Token usage

| Step              | Avg input tokens/prob | vs baseline |
| ----------------- | --------------------- | ----------- |
| baseline          | 3,669                 | —           |
| self-verification | 3,840                 | +5%         |
| pre-completion    | 3,737                 | +2%         |
| loop-detection    | 3,699                 | +1%         |
| context-pruning   | 3,767                 | +3%         |

Context pruning did not reduce tokens: with ≤2 `run_tests` calls per problem, keepLastN=3 retains
all pairs. CETC only saves tokens when ToolMessage history is longer than keepLastN.

### Output files

- `results/harness-v2/results.json`
- `results/harness-v2/pre-registration.json`

## Gotchas / lessons learned

- **Check the precondition before running the full matrix.** Run baseline, 1 run, check hidden
  pass rate. If ≥80%, stop — the matrix will be uninformative. The cost of a single baseline
  run is ~$0.08; the cost of finding out after 15 runs is ~$1.20.
- **Pre-register the precondition gate, not just the hypotheses.** The pre-registration JSON had
  hypotheses but no gate. A gate would have stopped the run early.
- **`env: {}` does not yield a fully empty process.env on macOS.** The OS injects ~4 vars
  (`PWD`, `SHLVL`, `_`, `__CF_USER_TEXT_ENCODING`) unconditionally. Test for API key absence
  specifically, not for zero-length env.
- **`--experimental-permission` is wrong on Node 24.** The stable flag is `--permission`. Node
  24 does not accept the experimental variant; the child process exits with "bad option".
- **`env: {}` kills PATH; use `process.execPath`.** Already known from v1; still the key fix.
- **p18 needs more test cases.** 1 total test case means no hidden evaluation. Any benchmark
  problem should have at least PUBLIC_TEST_COUNT + 2 cases.
- **Ceiling effect persists in agent loop.** Moving from single-call to agent-loop did not escape
  the ceiling. The model solves algorithmic problems in one shot whether or not it has a
  `run_tests` tool. Novel problems or a weaker model are required.
