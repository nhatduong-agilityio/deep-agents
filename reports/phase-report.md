# Phase Report: Rapid Development with DeepAgents

**Phase dates:** 2026-10-02 — 2026-10-08
**Primary model (all measured runs):** `gpt-5.4-mini-2026-03-17` (migrated from Gemini at T-DA-04)
**Agent harness:** `deepagents@1.14.1` on `@langchain/langgraph@1.4.18`
**Tracer:** LangSmith project `deep-agents-phase`

---

## Required Outputs

### Output 1 — Artifact Agent (T-DA-03)

**Requirement:** Agent produces `/report/summary.md`, `/report/findings/*.md` (≥3 files),
`/report/sources.md`; deterministic checker verifies file structure and source citations.

**Evidence:**

| Metric                              | Value                                                       |
| ----------------------------------- | ----------------------------------------------------------- |
| Checker pass rate                   | 3/3 runs                                                    |
| Findings files per passing run      | ≥3                                                          |
| Corpus files consulted              | EU AI Act excerpts + US EO 14110 (8 files, ~38.5KB)         |
| Avg tokens per run                  | 35,306                                                      |
| Total cost (3 runs, Gemini pricing) | $0.009154                                                   |
| Checker implementation              | `src/scripts/check-report.ts` — deterministic; no LLM judge |

**Key finding:** The Filesystem as Context (FSC) pattern was confirmed — token counts
rise exactly at model calls preceded by `read_file` results, not earlier. Content is
lazy-loaded per tool call, not pre-loaded into the system prompt. Token evidence from
validation run `d4a0378d`: `inputTokensPerCall: [4688, 4855, 8984, 11180, 12638]`
with `toolsBeforeCall: [[], ["ls"], ["read_file"×4], ["read_file"×2], ["write_file"×5]]`.

**LangSmith traces:** auto-traced under `deep-agents-phase`; validation run `d4a0378d-d8d3-427d-9e32-82341a1730f5` (post-T-DA-03, with `toolsBeforeCall` field); original 3 runs auto-traced (no explicit `runId` passed — `langsmithRunId: null` in pre-fix results).

---

### Output 2 — Planning Trace (T-DA-02)

**Requirement:** LangSmith trace shows `write_todos` as the first tool call;
todo status updates (pending→in_progress→completed) visible throughout the run.

**Evidence:**

| Metric                        | Baseline (no instruction) | Treatment (prompt instruction) |
| ----------------------------- | ------------------------- | ------------------------------ |
| `write_todos` first-call rate | 0/10                      | 10/10                          |
| Avg total tokens              | 14,116                    | 44,934                         |
| Token overhead                | —                         | +30,818 (+218%)                |
| Model calls per run (median)  | 3                         | 7                              |

Token overhead decomposition (median 7-call mode): ~61% from additional model calls,
~39% from message-history growth per call (`write_todos` call + result accumulate in
the window, raising avg per-call context from 4,625 to 6,063 tokens).

**LangSmith traces:** 20 runs auto-traced under `deep-agents-phase` with
`deepagents_version: 1.14.1`, `model_id: gemini-3.5-flash-lite` in metadata.
No per-run IDs captured (added post-T-DA-03; T-DA-02 results predate the `runId` fix).

**Caveat:** 10/10 success gives a Clopper-Pearson 95% CI lower bound of ~69% — result
demonstrates feasibility, not a production guarantee. A model update can silently degrade
the first-call rate.

---

### Output 3 — Context Isolation Proof (T-DA-04)

**Requirement:** Config B (sub-agent delegation) main-agent peak input tokens ≤50% of
Config A (single agent); gate passes on ≥3 measured run pairs; quality identical.

**Evidence (v2 — gate-passing dataset, 8-file / ~38.5KB corpus):**

| Run pair   | Config A peak tokens | Config B peak tokens | Ratio             |
| ---------- | -------------------- | -------------------- | ----------------- |
| 1          | 10,851               | 3,566                | 0.329             |
| 2          | 10,851               | 3,566                | 0.329             |
| 3          | 10,851               | 3,566                | 0.329             |
| **Median** | **10,851**           | **3,566**            | **0.3286 — PASS** |

| Metric                           | Value                        |
| -------------------------------- | ---------------------------- |
| Isolation gate (≤0.50)           | **PASS** — 0.3286            |
| Quality gate (checker)           | 3/3 A, 3/3 B                 |
| 3-run system cost — A            | $0.1322                      |
| 3-run system cost — B            | $0.1320                      |
| First-call token overhead A vs B | 4,210 vs 4,485 (+275 tokens) |

**v1 deviation (6-file / ~20KB corpus):** ratio 0.5464 — gate FAIL. The CIP gain is
corpus-size-dependent: at small payloads the fixed per-call overhead dominates.
See DDR-010.

**LangSmith run IDs (v2, gate-passing):**

| Pair | Config A                               | Config B                               |
| ---- | -------------------------------------- | -------------------------------------- |
| 1    | `182461b8-febd-4799-ac72-f89d96c8b72c` | `0a943b21-91f7-4557-bb5e-4280594e4116` |
| 2    | `2d1c663b-4aff-4107-9309-3505adb7fd17` | `bd652841-db98-45a9-896c-de5366b60193` |
| 3    | `271f4d85-4527-4cf9-b702-907a83fabd94` | `8d9a2e1f-36f8-4ca5-a6e5-58dd518268ad` |

---

## Supporting Experiments

### T-DA-05 — Critique Workflow

Producer-Critic loop: supervisor agent + critic sub-agent via `task` tool; hash-guard
middleware caps rounds at 3 and blocks the critic from modifying `/drafts/`.

| Metric                                | V1 (direct)                         | V2 (task sub-agent)    |
| ------------------------------------- | ----------------------------------- | ---------------------- |
| Seeded flaws fixed (corrected scorer) | 4/5                                 | 4/5                    |
| Persistent unfixed flaw               | F1 (Annex III / Article 6 citation) | F1 (same)              |
| Critic rounds completed               | 3                                   | 3                      |
| Feedback items per round              | 10 → 12 → 17                        | 6 → 5 → 6              |
| Adversarial `/drafts/` write denied   | ✓ (LangSmith verified)              | ✓                      |
| System total cost                     | $0.0906 (Gemini)                    | $0.0518 (gpt-5.4-mini) |

F5 (terminology) fixed after round 1 in both configs; F2/F3/F4 fixed in the final
draft; F1 (citation gap) never corrected. Revision notes self-reported 100% coverage
but the draft text for F1 was unchanged across all rounds — reliable evidence that
self-reported coverage is not sufficient (root-caused in T-DA-07).

Closed with documented deviation. DDR-015 records the task-sub-agent design.

**LangSmith run IDs:**

| Role                           | Run ID                                 |
| ------------------------------ | -------------------------------------- |
| V2 supervisor (3-round loop)   | `9a320206-8ffe-4cea-80cf-a8c13729dfe0` |
| V2 critic round 1              | `7ed1e2b2-6b30-4323-969e-ee891ae107ec` |
| V2 critic round 2              | `5ad9650a-1a06-4bf4-8326-7ada13114d6b` |
| V2 critic round 3              | `ac5f5f0f-b823-49c7-a3c3-be36c8487c6e` |
| V1 `/drafts/` denial test (×3) | `2616cf1c`, `35c1eb98`, `e5625c35`     |
| V1 `/report/` denial test (×3) | `0c426bfb`, `29bd4431`, `e5fd4ac1`     |
| Delete-via-write BRC test      | `bba95992-946d-4452-8be1-3cf362603fd6` |
| V2 adversarial write test (×2) | `70b0348b`, `2b345a88`                 |

---

### T-DA-06 — Harness Optimization Drills

Deep-agent benchmark on 20-problem TypeScript subset. All 5 harness steps (baseline,
self-verification, pre-completion, loop-detection, context-pruning) scored 100% public
and hidden pass rate — ceiling effect; no differentiation measurable.

| Step              | Public | Hidden | Cost (20 problems) | Avg model calls |
| ----------------- | ------ | ------ | ------------------ | --------------- |
| baseline          | 100%   | 100%   | $0.0764            | 2.00            |
| self-verification | 100%   | 100%   | $0.0789            | 2.03            |
| pre-completion    | 100%   | 100%   | $0.0780            | 2.02            |
| loop-detection    | 100%   | 100%   | $0.0763            | 2.02            |
| context-pruning   | 100%   | 100%   | $0.0778            | 2.05            |

Closed with documented deviation: the ≥20% baseline failure precondition was not
pre-registered before running. See `reports/T-DA-06-v2-report.md`.
LangSmith trace IDs not captured in v2 (run IDs not passed to `invoke`; fixable by adding
`{ runId: crypto.randomUUID() }` to invoke options).

---

### T-DA-07 — "Loses the Plot" Trace Analysis

Root-cause analysis of T-DA-05 producer failure. Three failure points identified:

| ID  | Span                               | Tool                                | Expected                                       | Actual                                                                |
| --- | ---------------------------------- | ----------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| FP1 | supervisor model call → write_file | `write_file(/drafts/draft-vN+1.md)` | Every feedback item maps to a diff             | Draft written after reading feedback; F1–F4 content unchanged         |
| FP2 | supervisor model call → write_file | `write_file(/notes/revision-2.md)`  | Items 1–12 from round-2 feedback               | 10 items using round-1 numbering; items 11–12 never addressed         |
| FP3 | supervisor model call × 4          | `write_file(/drafts/draft-v2.md)`   | Model inserts notes write after gate rejection | Same draft write retried 4× without adapting; run hit recursion limit |

Fix implemented: `RevisionGateMiddleware` (wrapToolCall) — blocks draft writes when
revision notes don't structurally cover all feedback items. Gate fired correctly
(4 blocks); model never adapted → process-completeness regression (no committed draft).

Key insight from FP3: **wrapToolCall cannot change a model's batched generation plan.**
Use `wrapModelCall` to inject context before the model generates if behavioral change
is needed.

Pre-registration v2 written for a diff-based verification gate (Option A).

**LangSmith run ID:** `8f2ff0f1-6dfb-46c2-841d-f7c29e3b54c8`

---

## DDR Inventory

All 15 DDRs verified present on disk in `docs/decisions/`. See `docs/decisions/README.md`
for the full index with pattern/task cross-references.

| Range       | Decisions                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------ |
| DDR-001–005 | Project foundation: stack, tracer, provider policy, no HTTP server, measurement discipline |
| DDR-006–007 | T-DA-02/03: filesystem backend (FSC), planning enforcement (PTR)                           |
| DDR-008–009 | T-DA-05/06: critic permissions (BRC+PC), benchmark execution environment                   |
| DDR-010–011 | T-DA-04: CIP scaling hypothesis (confirmed); Gemini tool filtering (superseded)            |
| DDR-012–013 | T-DA-04: model switch to gpt-5.4-mini; sub-agent middleware injection                      |
| DDR-014–015 | T-DA-07/05: DeepAgents vs LangGraph boundary; PC loop sub-agent design                     |

---

## Cost Summary

Costs below are in USD. Gemini figures use free-tier runs (rate-limited, not billed);
gpt-5.4-mini figures use $0.75/$4.50 per 1M input/output tokens (measured from
`systemInputTokens`/`systemOutputTokens`).

| Task                                | Model        | Runs      | Cost                    | Notes                                                   |
| ----------------------------------- | ------------ | --------- | ----------------------- | ------------------------------------------------------- |
| T-DA-02                             | Gemini       | 20        | ~$0.02 est.             | 44,934 avg tokens × 10 treatment + 14,116 × 10 baseline |
| T-DA-03                             | Gemini       | 3         | $0.009154               | 3 checker-passing artifact runs                         |
| T-DA-04 v2                          | gpt-5.4-mini | 6         | A: $0.1322 / B: $0.1320 | 3-run system totals per config                          |
| T-DA-05 V1                          | Gemini       | 3 rounds  | $0.0906                 | supervisor + critic, 3 rounds                           |
| T-DA-05 V2                          | gpt-5.4-mini | 3 rounds  | $0.0518                 | $0.0359 supervisor + $0.0159 critic                     |
| T-DA-06 v2                          | gpt-5.4-mini | 100       | ~$0.39                  | 5 steps × 20 problems; $0.0764–$0.0789/step             |
| T-DA-07                             | gpt-5.4-mini | 1 fix run | $0.0621                 | Gate FAIL; process failure                              |
| **Phase total (gpt-5.4-mini only)** |              |           | **~$0.93**              | T-DA-04 v2 + T-DA-05 V2 + T-DA-06 + T-DA-07             |

---

## Lessons Learned

### 1 — wrapToolCall vs wrapModelCall boundary (T-DA-07 FP3)

`wrapToolCall` fires after the model has committed its action sequence for the turn.
Blocking a tool call within a batched generation only affects that one call; the model
retries the same sequence rather than inserting a prerequisite step. To change what the
model generates, inject context with `wrapModelCall` before the next generation. This
is the most consequential architectural insight of the phase.

### 2 — Negative-condition scorers need positive section guards (T-DA-07)

A check of the form `!/bad phrase/.test(text)` evaluates `true` on an empty string.
Any scorer that relies on negative conditions (phrase absent = flaw fixed) must also
require positive evidence the relevant section still exists, otherwise deletion or
a missing file scores as a fix. The corrected `scoreDraft` function in
`src/experiments/trace-analysis/scorer.ts` demonstrates the pattern.

### 3 — Pre-registration discipline prevents post-hoc gate adjustment (T-DA-07)

Writing `pre-registration.json` before any experiment run (with a filesystem timestamp
earlier than `results.json`) proves the gate was not tuned to match the result. The
T-DA-07 gate FAIL is clean evidence precisely because the threshold was locked before
the run. Applying this to T-DA-06 would have prevented the uninformative ceiling result.

### 4 — LangSmith span indexing lags run completion (T-DA-04)

The first LangSmith span query after a run may return fewer spans than ultimately exist.
On T-DA-04 A1, the first poll returned 6 spans (45,521 tokens); re-query returned 7 spans
(57,077 tokens). Poll with a stability check (two consecutive polls agree on span count)
before reading span-level data. Primary token measurements should come from in-process
`AIMessage.usage_metadata`, which is synchronous and immune to indexing lag.

### 5 — Self-reported revision coverage is unreliable (T-DA-05)

The T-DA-05 supervisor self-reported "10/10 items addressed" in revision notes round 1.
F1–F4 content reappeared unchanged in the next draft. Self-report proves the model
understood the task, not that it executed it. Verification must be mechanical
(diff the draft text) not epistemic (trust the model's claim).

### 6 — CIP isolation benefit requires corpus larger than fixed overhead (T-DA-04)

At ~20KB corpus, the per-call DeepAgents overhead (4,210 vs 4,485 tokens on first call)
dominates and the isolation ratio (0.5464) fails the ≤0.50 gate. At ~38.5KB the ratio
drops to 0.3286 (PASS). Delegation pays off when the retrieval payload is large enough
that avoiding it in the main agent's subsequent calls exceeds the sub-agent setup cost.
See DDR-010.

### 7 — Baseline ceiling effect invalidates harness comparisons (T-DA-06)

gpt-5.4-mini-2026-03-17 solved every benchmark problem on the first `run_tests` call
(100% baseline). All 5 harness steps scored identically. Any improvement from
self-verification or pre-completion middleware is invisible at ceiling. Pre-register
a ≥20% baseline failure precondition and run only the baseline before committing to
the full step × run matrix.

### 8 — Sub-agent middleware must be injected explicitly (T-DA-04, DDR-013)

`mergeMiddlewareStack` uses `appendNew:false` — parent middleware is NOT inherited by
sub-agents spawned via the `task` tool. Passing `middleware: [workerFsMw]` explicitly
to each sub-agent spec at construction time is required. Relying on parent-stack
inheritance silently produces sub-agents with no filesystem rules.

---

## Appendix — All LangSmith Trace IDs

| Task       | Role                                 | Run ID                                 |
| ---------- | ------------------------------------ | -------------------------------------- |
| T-DA-03    | Artifact agent validation run        | `d4a0378d-d8d3-427d-9e32-82341a1730f5` |
| T-DA-04 v2 | Config A pair 1                      | `182461b8-febd-4799-ac72-f89d96c8b72c` |
| T-DA-04 v2 | Config B pair 1                      | `0a943b21-91f7-4557-bb5e-4280594e4116` |
| T-DA-04 v2 | Config A pair 2                      | `2d1c663b-4aff-4107-9309-3505adb7fd17` |
| T-DA-04 v2 | Config B pair 2                      | `bd652841-db98-45a9-896c-de5366b60193` |
| T-DA-04 v2 | Config A pair 3                      | `271f4d85-4527-4cf9-b702-907a83fabd94` |
| T-DA-04 v2 | Config B pair 3                      | `8d9a2e1f-36f8-4ca5-a6e5-58dd518268ad` |
| T-DA-04 v1 | Config A pair 1                      | `730aafa7-6cd0-453e-b6f6-049f0d19c8fa` |
| T-DA-04 v1 | Config B pair 1                      | `09bad804-12f8-499d-beac-357c3c67f884` |
| T-DA-04 v1 | Config A pair 2                      | `7fd5532d-093a-4aee-9155-95262d1445c1` |
| T-DA-04 v1 | Config B pair 2                      | `ce76e1f9-7cfd-4e2d-91b4-f08000164619` |
| T-DA-04 v1 | Config A pair 3                      | `84e2f53f-70f1-4b91-8358-f86ecba1a8c8` |
| T-DA-04 v1 | Config B pair 3                      | `3ddbe64e-c0cd-4007-8208-75d52de243e9` |
| T-DA-05    | V2 supervisor (3-round loop)         | `9a320206-8ffe-4cea-80cf-a8c13729dfe0` |
| T-DA-05    | V2 critic round 1                    | `7ed1e2b2-6b30-4323-969e-ee891ae107ec` |
| T-DA-05    | V2 critic round 2                    | `5ad9650a-1a06-4bf4-8326-7ada13114d6b` |
| T-DA-05    | V2 critic round 3                    | `ac5f5f0f-b823-49c7-a3c3-be36c8487c6e` |
| T-DA-05    | V1 `/drafts/` denial run 1           | `2616cf1c-ae3b-4434-a9a3-fdf4b5cc3981` |
| T-DA-05    | V1 `/drafts/` denial run 2           | `35c1eb98-1295-4616-9e7c-b819a2aca00b` |
| T-DA-05    | V1 `/drafts/` denial run 3           | `e5625c35-be58-4631-bf21-8c7238ee95ae` |
| T-DA-05    | V1 `/report/` denial run 1           | `0c426bfb-b6d6-433c-8631-16c2533c4bf3` |
| T-DA-05    | V1 `/report/` denial run 2           | `29bd4431-8a79-4d2d-8549-054ed299353f` |
| T-DA-05    | V1 `/report/` denial run 3           | `e5fd4ac1-729f-4a65-9d38-102d50834ede` |
| T-DA-05    | Delete-via-write BRC test            | `bba95992-946d-4452-8be1-3cf362603fd6` |
| T-DA-05    | V2 `/drafts/` adversarial write test | `70b0348b-10e8-4b20-8cb4-f077572cfa60` |
| T-DA-05    | V2 `/report/` adversarial write test | `2b345a88-a3e2-4ccd-a53b-29547e2679be` |
| T-DA-07    | RevisionGateMiddleware fix run       | `8f2ff0f1-6dfb-46c2-841d-f7c29e3b54c8` |
