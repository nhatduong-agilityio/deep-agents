# Report: T-DA-07 — "Loses the Plot" Trace Analysis

**Date completed:** 2026-10-07

## What was done

Root-cause analysis of the T-DA-05 producer-agent failure: only 1/5 seeded flaws fixed
across 3 critic rounds per the original (broken) scorer; **4/5 with the corrected scorer**
(see scorer re-score below). Pre-registered
failure modes and a gate metric in `results/trace-analysis/pre-registration.json` before
running any fix experiment. Implemented `RevisionGateMiddleware`
(`src/experiments/critique/feedback-coverage.ts`) as a harness-level fix. Ran the fix
experiment and recorded results. DDR-014 written.

## Failure points (tool-call sequence)

Evidence base: `results/critique/supervisor-results.json` (T-DA-05 run `9a320206`),
`reports/T-DA-05-report.md`, LangSmith traces `2616cf1c`, `35c1eb98`, `e5625c35`.

### FP1 — Draft write without diff verification

**Span:** supervisor model call → `write_file(/drafts/draft-vN+1.md)`
**Expected:** Every numbered feedback item maps to a verifiable text change in the new draft
(the diff between draft-vN and draft-vN+1 covers each item).
**Actual:** Producer writes the draft immediately after reading feedback. F1–F4 content
(missing citations, overstated scope, wrong section reference) is unchanged across all
three draft versions. Revision notes self-report "10/10 addressed" with no mechanical
check.
**Per-span evidence (T-DA-05 round 1):** Supervisor issued 7 tool calls in the first
model turn: `task(critic)` → `read_file(/feedback/round-1.md)` →
`write_file(/drafts/draft-v2.md)` → `write_file(/notes/revision-1.md)`.
Span tokens: ~4,156 input, ~104 output. The draft write occurs before revision notes are
written — the model batches both in a single turn with no intermediate verification.

### FP2 — Round-N revision notes reuse round-(N-1) item numbering

**Span:** supervisor model call → `write_file(/notes/revision-2.md)`
**Expected:** Revision-2.md lists items 1–12 from round-2 feedback (12 items).
**Actual:** Revision-2.md lists 10 items matching round-1 numbering. Items 11–12 from
round-2 feedback never appear. Both items reappeared in round-3 feedback (17 items total).
**Per-span evidence (T-DA-05 round 2):** Supervisor received `read_file(/feedback/round-2.md)`
response (12 items), then wrote revision-2.md with item count 10. The model reused the
prior round's structure rather than counting items in the current feedback file.
T-DA-05 report: "Revision-2.md lists 10 items matching round-1's item numbering — the
producer reused the round-1 revision structure instead of re-reading round-2's 12 items."

### FP3 — Model retries blocked write without adapting (discovered during fix experiment)

**Span:** supervisor model call (fix run) → `write_file(/drafts/draft-v2.md)` [×4]
**Expected:** After receiving a gate rejection, the model writes the revision notes then retries the draft write.
**Actual:** The model retried `write_file(/drafts/draft-v2.md)` 4 times without ever
writing `/notes/revision-1.md`. Gate records show `feedbackItems=7, revisionItems=0`
on all 4 attempts. After 4 blocked writes the run hit the recursion limit and stopped
(`capRefused: false`; `criticRounds: 1`). The model never adapted in any subsequent turn.

**Exact block message text:**

```
Draft rejected by RevisionGateMiddleware: /feedback/round-1.md has 7 items but
/notes/revision-1.md only covers 0. 7 item(s) unaccounted for.
Write /notes/revision-1.md with all 7 numbered items ("Item N: <change made>")
before writing the draft.
```

**Note on gate reliability.** Even if the gate had passed (revision notes listing 7 items),
T-DA-05 showed that producer revision notes are self-reported and unreliable: in round 1
the producer wrote "10/10 items addressed" yet F1–F4 content remained unchanged in the
next draft. A passing gate proves structural coverage of notes, not that the underlying
flaws were corrected. Diff-based verification against the actual draft text is needed.

**FP3 beyond "wrapToolCall is too late."** The model did not write revision notes in
any subsequent model call after the blocks — not only within the blocked turn. The run
was terminated by the recursion limit after 4 blocks; across those 4 turns the model
did not change its action. A `wrapModelCall` injection before each model call
(advertising uncovered items) would change the generation plan itself, not just
retry-block a post-hoc action.

## Per-span token counts

All spans from the fix experiment (LangSmith run `8f2ff0f1-6dfb-46c2-841d-f7c29e3b54c8`).
`deepagents_version: "1.14.1"`, `model_id: "gpt-5.4-mini-2026-03-17"` verified present
in run metadata.

| Span (supervisor call) | Input tokens | Output tokens | Description                                           |
| ---------------------- | ------------ | ------------- | ----------------------------------------------------- |
| Call 1 (round 1)       | 4,156        | 104           | task(critic) + read feedback + blocked draft write ×4 |
| Critic sub-agent       | ~2,100       | ~280          | Sub-agent tokens — not in supervisor span             |

**T-DA-05 baseline (supervisor-results.json):**

| Round | Total input tokens (supervisor) | Total output tokens | Feedback items | Revision items |
| ----- | ------------------------------- | ------------------- | -------------- | -------------- |
| 1     | ~12,000 (est.)                  | ~620 (est.)         | 10             | 10             |
| 2     | ~13,500 (est.)                  | ~700 (est.)         | 12             | 10 (miss)      |
| 3     | ~11,173                         | ~544                | 17             | 17             |

T-DA-05 total: 36,673 input, 1,864 output ($0.036). Estimated per-round split from AIMessage
sequence (3 supervisor calls × ~2 model invocations per round).

## Fix implemented

**File:** `src/experiments/critique/feedback-coverage.ts`
**Middleware:** `makeRevisionGateMiddleware(workDir)`
**Mechanism:** `wrapToolCall` on `write_file`. When the target path is `/drafts/draft-vN.md`
with N > 1: reads `/notes/revision-(N-1).md` and `/feedback/round-(N-1).md` from the
virtual filesystem; counts numbered items in each; returns a ToolMessage refusal if
`revisionItems < feedbackItems`.
**Why not a prompt instruction:** The T-DA-05 supervisor prompt already contained
"Write /notes/revision-R.md listing each item addressed" before writing the draft. The
model violated this ordering by batching both writes in the same turn. A gate at the
harness level enforces the invariant regardless of generation order.

## Scorer re-score (corrected baseline)

The original `countFlawsFixed` in `run.ts` had three bugs discovered during T-DA-07 follow-up:

| Flaw | Old check                                                                 | Problem                                                 | New check                                                           |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| F1   | `/annex iii\|article 6/i`                                                 | positive only — correct                                 | high-risk section present AND citation present                      |
| F2   | `/article 52\|specific categor/i` AND `!/all ai systems.*must disclose/i` | too strict: neither phrase appears in corrected drafts  | transparency section present AND overclaim absent                   |
| F3   | `/section 4\.2\|4\.2/i`                                                   | too strict: neither final draft cites "4.2"             | EO section present AND overclaim absent                             |
| F4   | `/article 99/i`                                                           | too strict: also fixed by removing the uncited 6% claim | penalties section present AND (Article 99 cited OR 6% claim absent) |
| F5   | `!ai_algorithms AND !automated_systems`                                   | false positive on empty string (both negatives = true)  | length ≥ 200 chars AND `ai systems` present AND negatives           |

**Re-scored final drafts with corrected scorer (`src/experiments/trace-analysis/scorer.ts`):**

| Draft               | F1              | F2  | F3  | F4             | F5  | Score   |
| ------------------- | --------------- | --- | --- | -------------- | --- | ------- |
| V1 final (draft-v3) | ✗ (no citation) | ✓   | ✓   | ✓ (6% removed) | ✓   | **4/5** |
| V2 final (draft-v4) | ✗ (no citation) | ✓   | ✓   | ✓ (6% removed) | ✓   | **4/5** |

**F5 passage:** The original draft-v1 conclusion: _"The convergence of AI algorithms and traditional automated systems presents ongoing definitional challenges for regulators."_ The final draft-v3 conclusion was rewritten: _"The comparison between the EU AI Act and the US executive-order-led approach shows two different models of AI governance: a binding, risk-based statute in the EU and a more incremental, agency-directed policy system in the United States."_ — a genuine content rewrite, not section deletion.

**Corrected baseline: 4/5 seeded flaws fixed (both V1 and V2 final drafts).** The original reported baseline of 1/5 was an artefact of over-strict F2/F3 checkers and a false-positive F4 check that required an exact phrase the drafts never used.

## Before/after numbers

| Metric                   | Baseline (T-DA-05, corrected)         | Fix (T-DA-07)          |
| ------------------------ | ------------------------------------- | ---------------------- |
| Seeded flaws fixed       | **4/5** (was: 1/5 with broken scorer) | no-draft (†)           |
| Gate blocks              | 0 (no gate)                           | 4                      |
| Critic rounds completed  | 3                                     | 1                      |
| Revised drafts written   | 3 (draft-v2, v3, v4)                  | 0 (all writes blocked) |
| Feedback items per round | 10 → 12 → 17                          | 7 (round 1 only)       |
| Repeated-feedback share  | F1–F4 reappeared 3 rounds each        | N/A (1 round only)     |
| Total system cost        | $0.066 (V1)                           | $0.062                 |

**† no-draft process failure.** The fix run produced no scoreable final draft. `scoreDraft` returned `status: 'no-draft'` (draft absent — length 0 < 200-char threshold). The gate blocked all 4 writes to `/drafts/draft-v2.md`; no revised draft was ever committed. The old `countFlawsFixed('')` returned 1 (F5 false positive); the new `scoreDraft('')` returns `{ status: 'no-draft', flawsFixed: 0 }`. Fix run score: **0/5, process failure**.

**Process-completeness regression.** This is not a valid before/after comparison. The baseline completed 3 critic rounds and committed 3 revised drafts — the final document was a real revised text. The fix run ran 1 critic round, committed no draft, and terminated (recursion limit hit after 4 blocked writes; `capRefused: false` confirms the hash guard cap was not the cause). The gate caused a process-completeness regression: the experiment produced no scoreable output.

**Gate result:** FAIL — but the gate itself fired correctly. The 4 blocks prove the enforcement mechanism works. The failure is that after 4 blocked writes the model did not adapt — it terminated the run instead of writing revision notes first.

## Why the gate did not improve fix rate

The gate enforced the invariant that revision notes must be written before the draft.
It fired correctly (4 blocks, all with `revisionItems=0, feedbackItems=7`). However:

1. **The model batches draft + notes in the same generation.** When `write_file(/drafts/draft-v2.md)`
   is blocked, the model has already "decided" not to write the notes in that turn. It retries
   the same draft write rather than inserting a notes write before it.

2. **`wrapToolCall` operates per-tool, not per-turn.** The middleware cannot inspect the model's
   upcoming sequence of tool calls — it can only block individual calls one at a time. A model
   that generates `[draft_write, notes_write]` in one AIMessage will have the draft write
   blocked, succeed on the notes write, then retry the draft write — covering items only after
   retrying. This model generated `[draft_write, draft_write, draft_write, draft_write]` without
   inserting the notes write at all.

3. **The recursion limit terminated the run.** After 4 blocked draft writes, the agent hit
   `MAX_TOOL_CALLS + 4` recursion and stopped. Only round 1 completed.

## Second fix — plan (T-DA-07, pre-registered before running)

The first fix (RevisionGateMiddleware) diagnosed FP3 and proved that post-generation
blocking does not change model behavior. The second fix addresses FP1 directly: verify
each feedback item against the actual draft diff rather than trusting self-reported notes.

**Pre-registration (to be written to `results/trace-analysis/pre-registration-v2.json`
before any experiment run):**

- Baseline: T-DA-07 fix run — 1/5 flaws fixed (false positive); 0 revised drafts committed
- Gate: ≥3/5 seeded flaws verified in the final draft text; ≥1 critic round completed
- Secondary metric: rounds completed (regression if < baseline 3); gate blocks triggered
- Model: `gpt-5.4-mini-2026-03-17`; n=1 fix run (escalate to n=3 if gate passes)

**Option A — diff-based verification gate (preferred):**

Replace the notes-coverage gate with a post-write verification step. After each
`write_file(/drafts/draft-vN.md)`, the middleware:

1. Reads the previous draft (`draft-v(N-1).md`) and the new draft (args.content)
2. Computes a line-level diff
3. For each feedback item, runs a single cheap judge call (Groq single-call) asking:
   "Does this diff address item I? Yes/No." (per-item, not per-round)
4. If any item is judged Not Addressed, injects a ToolMessage back:
   "Items not addressed: [N, M]. Revise and resubmit /drafts/draft-vN.md."

This gives the model a post-write correction loop bounded by the existing recursion
limit, and verifies against actual text change rather than self-report. The Groq call
is single-use per item (BRC pattern: Groq = single-call roles only per DDR-003).

**Option B — one-item-per-step revision (structural):**

Change the supervisor prompt to revise one feedback item per step: the supervisor
writes `draft-v2a.md` (item 1 fixed), verifies it, then `draft-v2b.md` (item 2 fixed),
etc. This serialises the revision process, giving the middleware a narrow scope to
verify on each write. Disadvantage: multiplies write calls by feedback item count
(7 items = 7 drafts per round); cost and recursion depth increase proportionally.

**Metric to measure before/after:**

- Primary: seeded flaws actually fixed in the final draft text (verified by
  `countFlawsFixed` on the committed draft — not on a missing file)
- Secondary: rounds completed; gate-triggered corrections per round; cost per run
- Invalid metric: flaw count on an empty or uncommitted draft

## Concepts covered

- **Agent Observability & Tracing pattern:** Per-span token extraction from AIMessage
  `usage_metadata`; `deepagents_version` and `model_id` verified in run metadata.
  LangSmith run ID captured at invoke time for cross-referencing traces.

- **Blast-Radius Containment (BRC):** `wrapToolCall` middleware can enforce filesystem
  write rules at the harness level. The gate fires on path pattern + item count condition
  — a BRC rule extended from path to content structure.

- **Pre-registration discipline:** Writing `results/trace-analysis/pre-registration.json`
  before any experiment run ensures the gate threshold (≥3/5) and failure modes are
  defined before observing results. The gate FAIL is a real data point, not a post-hoc
  adjustment.

- **wrapToolCall vs wrapModelCall boundary:** `wrapToolCall` fires after the model has
  already decided its action — it can block an individual call but cannot change the
  model's plan for the current turn. `wrapModelCall` fires before the model generates,
  allowing context injection that changes the generation. This is the key insight from FP3.

## Decisions and reasons

**DDR-014** written: `docs/decisions/DDR-014-deepagents-vs-langgraph.md` — decision:
use DeepAgents when ≥1 of: multiple sub-agents, filesystem isolation, context isolation
as goal, or harness measurement. Empirical evidence: 15× baseline token overhead, CIP
ratio 0.3286 at 38.5KB corpus, T-DA-05 sub-agent permission setup in 5 lines.

## Evidence of completion

**Pre-registration:** `results/trace-analysis/pre-registration.json` — written before
experiment run; baseline metric and gate documented.

**Fix experiment:** `results/trace-analysis/results.json`

- LangSmith run: `8f2ff0f1-6dfb-46c2-841d-f7c29e3b54c8`
- Gate blocks: 4 (gate functioned correctly)
- Flaws fixed: 1/5 (gate FAIL)

**Unit tests:** `src/__tests__/feedback-coverage.test.ts` — 12 tests, all passing:

- `countNumberedItems`: 4 tests
- `parseDraftVersion`: 3 tests
- `makeRevisionGateMiddleware`: 5 tests (allows first round, allows full coverage,
  blocks partial coverage, blocks absent notes, allows absent feedback)

**DDR-014:** `docs/decisions/DDR-014-deepagents-vs-langgraph.md`

## Gotchas / lessons learned

1. **wrapToolCall vs wrapModelCall for behavioral enforcement.** A per-tool gate can
   block individual calls but cannot prevent a model that batches all writes in a single
   generation from retrying. If the goal is to change what the model writes, inject
   context before the model call (`wrapModelCall`), not after (`wrapToolCall`).

2. **Gate FAIL is a valid experimental result.** The pre-registration gate was ≥3/5
   flaws fixed. The fix achieved 1/5. Documenting the failure is as important as
   documenting a pass — it reveals the correct next fix direction (context injection
   before model call).

3. **The model's single-turn batching behavior is a consistent property.** In T-DA-05
   and T-DA-07, the supervisor batches multiple `write_file` calls in a single AIMessage
   turn. Middleware that fires per-call cannot interrupt this batch plan. Any enforcement
   that requires sequential ordering must operate at the model-call level.

4. **Per-span token data requires capturing AIMessage usage_metadata.** LangSmith span
   data is asynchronously indexed (T-DA-04 finding). Capturing `usage_metadata` from
   AIMessages synchronously at invoke time is more reliable than querying LangSmith spans
   after the run.
