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

- **PTR (Plan & TODO Recitation):** `write_todos` writes a numbered todo list into agent state; deepagents injects it into every subsequent model call. This keeps the agent on track but adds ~4,400 tokens of recitation overhead per model step — the 7-call treatment runs consumed 3.2× more tokens than the 3-call baseline runs.

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
- LangSmith traces: auto-traced under project `deep-agents-phase` (check https://smith.langchain.com); `deepagents_version: 1.14.1`, `model_id: gemini-3.5-flash-lite` in metadata on every run

## Gotchas / lessons learned

- **`FilesystemBackend` ignores `virtualMode` by default:** Without `virtualMode: true`, absolute paths bypass `rootDir` entirely and hit the real filesystem. Agent task paths like `/workspace/findings.md` resulted in files written to `~/findings.md` (home dir) on runs before this was fixed.

- **deepagents wraps 429s in `MiddlewareError`:** A plain `err.status === 429` check does not work. The HTTP status is nested 3–5 levels deep via `.cause`. Use recursive traversal — see `getStatus()` in `src/lib/backoff.ts`.

- **Retry-hint regex needs to handle decimal seconds:** The Gemini API returns `"Please retry in 24.709091678s"`. The regex `/retry in (\d+)s/` fails to match because `.709` separates the number from `s`. Use `/retry in (\d+)/` (drop the trailing `s`).

- **Treatment runs consume 3× more tokens than baseline:** The `write_todos` todo list is injected into every model call's context (PTR pattern). For a 7-call treatment run: 7 × ~4,400 tokens of recitation overhead alone. Cap todo lists at ≤10 items (already enforced in the system prompt) to limit this.

- **`gemini-2.0-flash-lite-001` is gone:** Deprecated as of 2026-10-05. `gemini-3.5-flash-lite` is the replacement. No versioned pinned ID (`gemini-3.5-flash-lite-001`, `gemini-3.5-flash-lite-07-2026`) exists in the v1beta API — only the named alias works.
