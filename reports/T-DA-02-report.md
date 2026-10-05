# Report: T-DA-02 — Planning-First (Output 2)

**Date completed:** 2026-10-05

## What was done

- Created `src/experiments/planning-first/baseline.ts` — exports `runBaselineRun(n)`: agent with `gemini-3.5-flash-lite`, `[geminiToolFilter, todoListMiddleware()]`, no system prompt. Extracts firstTool, tokens, model calls from `result.messages` after each invoke.
- Created `src/experiments/planning-first/treatment.ts` — same agent config plus a system prompt instructing `write_todos` before any other tool. Imports shared types and helpers from `baseline.ts`.
- Created `src/experiments/planning-first/run.ts` — orchestrates 10 baseline + 10 treatment runs sequentially with 65 s inter-run pacing; saves `results/planning-first/results.json`; prints summary table.
- Updated `src/lib/backoff.ts` — added recursive cause-chain traversal (`getStatus`, `getRetryHintMs`) so deepagents `MiddlewareError` wrapping a 429 is correctly detected; fixed decimal-seconds regex (`/retry in (\d+)s/` → `/retry in (\d+)/`); increased default `maxRetries` to 8; increased `maxDelayMs` to 90 s.
- Added `virtualMode: true` to `FilesystemBackend` constructor in both experiment files — scopes all agent file paths under `rootDir`, preventing writes to home directory or filesystem root.
- Changed workspace root from `os.tmpdir()` to `tmp/planning-first/` inside the project; added `tmp/` to `.gitignore`.
- Exported `WORKSPACE_ROOT` from `baseline.ts` for use in `treatment.ts`.
- Ran experiment: 20 runs completed, `results/planning-first/results.json` written.
- Created `docs/decisions/DDR-007-planning-enforcement.md`; updated `docs/decisions/README.md` index.
- Updated `CLAUDE.md` and `docs/CODING-STANDARDS.md`: Gemini model constraint updated (`gemini-3.5-flash-lite` — no versioned ID available as of 2026-10-05; `gemini-2.0-flash-lite-001` deprecated).
- Updated `src/index.ts` to support canonical `LANGSMITH_*` env vars with `LANGCHAIN_*` fallback.
- Updated `.env.example` to canonical `LANGSMITH_*` names.

## Concepts covered

- **PTR (Plan & TODO Recitation):** `write_todos` writes a numbered todo list into agent state; deepagents injects it into every subsequent model call. The +30,818 token overhead breaks into two components using the **median** (7-call mode, excluding run 1 which took 10 calls as an outlier): ~61% from additional model calls (7 vs 3 baseline) and ~39% from message history growth per call (write_todos call + result messages accumulate in the window, growing avg per-call context from 4,625 tokens in baseline to 6,063 tokens in treatment). The mean-based figure (7.3 calls avg, including run 1) gives ~66%/~34% — consistent in direction. Both percentages and the per-call averages are **measured arithmetic** from `results/planning-first/results.json` (model call counts and per-call input token sums are in the data). **UNVERIFIED HYPOTHESIS:** The 4 extra model calls in treatment are caused by `write_todos` overhead (initial invocation + todo-status-update steps). Per-call `toolsBeforeCall` data was not collected in T-DA-02 (added post-T-DA-03); the call-count difference is measured, but which specific tools drove each extra step is inferred from expected behaviour, not directly observed.

- **FilesystemBackend `virtualMode`:** Without `virtualMode: true`, the backend treats all paths as actual filesystem paths — absolute paths like `/workspace/findings.md` are written to `/workspace/` at the system root (or fall back to home dir). With `virtualMode: true`, all paths are remapped under `rootDir`, making the workspace fully sandboxed.

- **deepagents `MiddlewareError` cause chain:** deepagents wraps every model-level error in a `MiddlewareError` chain before rethrowing. A 429 HTTP status is buried 3–5 levels deep in `.cause` — `withBackoff` must traverse the chain, not just check `err.status` directly.

- **Rate-limit pacing (free tier):** Gemini free tier enforces 15 RPM per model. Each agent run makes 3–10 model calls. The experiment uses a fixed 65 s inter-run delay to ensure the previous run's calls have left the sliding window before the next run starts.

## Decisions and reasons

- **Prompt instruction over middleware enforcement:** A system prompt instruction was chosen for planning enforcement (Option B) over middleware-hiding tools (Option C). The prompt approach is sufficient to produce the LangSmith planning trace required for Output 2, and is simpler to implement. Option C is documented in DDR-007 as the preferred long-term approach (less fragile across model updates).

- **2-file task over 4-file task:** Initial 4-file task produced 6–16 model calls per run, regularly exceeding the 15 RPM free-tier limit and causing unrecoverable retry loops. Reduced to 2 files → consistent 3 calls/baseline, 7 calls/treatment, both comfortably under the limit.

- **`gemini-3.5-flash-lite` as measured model:** `gemini-2.0-flash-lite-001` was deprecated by Google (HTTP 404). `gemini-3.5-flash-lite` is the current replacement; no versioned pinned ID is available via the v1beta API. Updated `CLAUDE.md` and `docs/PROGRESS.md` to reflect this.

See DDR-007 (`docs/decisions/DDR-007-planning-enforcement.md`) for the full planning enforcement decision record.

## Evidence of completion

```
=== SUMMARY ===
  write_todos first-call rate — baseline: 0/10  treatment: 10/10
  avg total tokens (with plan):    44934
  avg total tokens (without plan): 14116
  PTR token overhead: +30818 tokens vs no-plan runs

Results saved to results/planning-first/results.json
```

- `results/planning-first/results.json` — 20 run records, all with `inputTokens > 0` and `modelCallCount > 0`
- Per-call tool tracking (`toolsBeforeCall`) was not collected in T-DA-02 (added in the post-T-DA-03 hardening pass); write_todos call counts per run are inferred from `modelCallCount` (treatment runs average 7.3 calls vs baseline 3, with the extra ~4 calls split between the initial `write_todos` invocation and subsequent todo-status-update steps)
- **95% CI note:** 10/10 first-call successes gives a Clopper-Pearson exact 95% CI lower bound of ~69% for the true success rate. The result demonstrates feasibility of prompt-driven planning, not a guarantee — a model update could degrade the first-call rate silently.
- LangSmith traces: auto-traced under project `deep-agents-phase`; `deepagents_version: 1.14.1`, `model_id: gemini-3.5-flash-lite` in metadata on every run

## Gotchas / lessons learned

- **`FilesystemBackend` ignores `virtualMode` by default:** Without `virtualMode: true`, absolute paths bypass `rootDir` entirely and hit the real filesystem. Agent task paths like `/workspace/findings.md` resulted in files written to `~/findings.md` (home dir) on runs before this was fixed.

- **deepagents wraps 429s in `MiddlewareError`:** A plain `err.status === 429` check does not work. The HTTP status is nested 3–5 levels deep via `.cause`. Use recursive traversal — see `getStatus()` in `src/lib/backoff.ts`.

- **Retry-hint regex needs to handle decimal seconds:** The Gemini API returns `"Please retry in 24.709091678s"`. The regex `/retry in (\d+)s/` fails to match because `.709` separates the number from `s`. Use `/retry in (\d+)/` (drop the trailing `s`).

- **Treatment runs consume 3.2× more tokens than baseline:** Using the median (7-call mode), ~61% of the +30,818 overhead comes from additional model calls and ~39% from message history growth per call (write_todos call + result messages accumulate in the window, growing avg per-call context from 4,625 to 6,063 tokens). The two effects compound. Both percentages are **measured arithmetic** from `results/planning-first/results.json`. **Per-call tool data was not collected in T-DA-02** (`toolsBeforeCall` tracking added post-T-DA-03); the attribution of extra calls to `write_todos` activity (initial invocation + status updates) is an **UNVERIFIED HYPOTHESIS** — the call-count difference is measured, but which specific tools drove each extra step is inferred from expected behaviour, not directly observed. Cap todo lists at ≤10 items to limit the context-growth component.

- **`gemini-2.0-flash-lite-001` is gone:** Deprecated as of 2026-10-05. `gemini-3.5-flash-lite` is the replacement. No versioned pinned ID (`gemini-3.5-flash-lite-001`, `gemini-3.5-flash-lite-07-2026`) exists in the v1beta API — only the named alias works.
