# DDR-005: Measurement Discipline

**Date:** 2026-10-02
**Status:** Accepted

## Context

The phase requires reproducible experiment results across tasks T-DA-02 through T-DA-07. Without explicit discipline around how runs are executed and recorded, results are not comparable across sessions: a model alias can silently change, a rate-limited run can produce truncated output, and a missing version field makes a LangSmith trace unattributable. This DDR establishes the rules that all experiment scripts must follow.

## Options Considered

### Option A: No formal discipline — run as convenient

- Pros: fastest to start
- Cons: results are unreproducible; a model alias resolving to a different checkpoint between runs invalidates comparisons; parallel API calls on free tiers saturate quota and produce 429-induced truncations that look like agent failures

### Option B: Strict discipline — sequential runs, pinned versions, backoff, trace metadata

- Pros: results are reproducible; failures are attributable to agent behavior rather than infrastructure; any run can be re-examined in LangSmith with its exact model and harness version
- Cons: slower iteration; sequential runs cannot be parallelized even when the API would allow it

## Decision

Option B. The following rules apply to every experiment script:

**Run execution:**

- Sequential only — no parallel API calls within a single experiment session
- Exponential backoff on HTTP 429: `src/lib/backoff.ts` implements this; all experiment scripts import from there
- Per-run budget ceiling enforced by `src/lib/counter.ts` pre-step hook (4 dimensions: tokens, cost USD, wall ms, tool-call count)

**Version pinning:**

- All `package.json` deps pinned exact (no `^` or `~`)
- Before adding any new package: `npm show <pkg> version` → pin that exact version
- The Gemini Flash alias (`gemini-2.0-flash`) is acceptable for exploration only; measured runs must use the pinned versioned ID (e.g. `gemini-2.0-flash-001`)

**Trace metadata (required on every measured run):**

```typescript
const runConfig = {
  metadata: {
    deepagents_version: '1.14.1',
    model_id: 'gemini-2.0-flash-001',
    task_id: 'T-DA-XX',
    run_id: crypto.randomUUID(),
  },
};
```

**Recording:**

- LangSmith trace URL logged to stdout after each run
- URL pasted into `docs/PROGRESS.md` activity log for the task
- Aggregate results (pass rate, avg tokens, avg cost) written to `results/<task>/summary.json`

References: [[DDR-003]] (which model IDs are permitted in measured runs).

## Consequences

- `src/lib/backoff.ts` and `src/lib/counter.ts` are required infrastructure — T-DA-01 creates and unit-tests both before any experiment runs
- Experiment scripts that skip `runConfig.metadata` will be rejected at code review
- Sequential execution means T-DA-02's 20 runs (10 baseline + 10 treatment) take roughly 20× a single run's wall time — plan accordingly
- The version pinning rule means upgrading DeepAgents mid-phase is prohibited; if a bug fix is needed, open a new DDR before upgrading

## Empirical evidence

HTTP 429 from the Gemini free tier was observed during early multi-parallel exploration. After switching to sequential runs with backoff, no 429s occurred across 15 consecutive calls.
