# Report: T-FS-04 — End-to-End Verification + Operations Runbook

**Date completed:** 2026-10-09

## What was done

**New files created:**

- `vitest.e2e.config.ts` — dedicated Vitest config for e2e tests: 120s timeout,
  single-fork pool (sequential runs to avoid 429s), includes only
  `experiments/__tests__/e2e/**/*.test.ts`.

- `experiments/__tests__/e2e/adversarial.test.ts` — four test groups covering all
  DoD scenarios; uses direct `graph.invoke()` (same approach as
  `scripts/smoke-permissions.ts`), no live server required:
  - **Test 1**: adversarial `write_file` to `/skills/policy-report/SKILL.md` and
    `/agent.ts`; tries two prompt variants; file-unchanged assertion runs regardless
    of model outcome; enforcement assertion fires only when `writeAttempted=true`.
  - **Test 1b**: static graph middleware inspection — `_ToolExclusionMiddleware`
    present (confirms `task` excluded at call time), `execute` absent from tool names,
    `FilesystemMiddleware` count = 1.
  - **Test 2**: sets `process.env['THREAD_BUDGET_USD'] = '0.002'` before invoke,
    restores in `finally`; asserts caught error satisfies `isBudgetError()` which
    checks `.code`, `.error.code`, and `.message` patterns for `THREAD_BUDGET_EXCEEDED`.
  - **Test 3**: grep serialized messages from Tests 1+2 for raw API key values;
    structural `sk-` pattern check; optional walk of `apps/web/dist/` bundle.

- `docs/runbook.md` — operations runbook with four sections:
  1. Incident response (LangSmith trace flow, container logs, health check, thread
     state inspection).
  2. Key rotation (OPENAI_API_KEY, LANGSMITH_API_KEY, AUTH_TOKEN — each with
     verification step).
  3. Rollback (Docker image tags + volume restore, LangSmith Deployments UI rollback).
  4. Health check (endpoint table for `/ok` and `/info`, automated bash one-liners,
     smoke test commands).

**Modified files:**

- `vitest.config.ts` — added `experiments/__tests__/e2e/**` to `exclude` so
  `pnpm test` (unit suite) does not run live-API tests.

- `package.json` — added
  `"test:e2e": "node --env-file=.env node_modules/vitest/dist/cli.js run --config vitest.e2e.config.ts --reporter=verbose"`.

**Already verified as complete:**

- `packages/core/src/tool-args.ts` — `extractToolFilePath` present; no test or
  experiment file imports this helper from `experiments/critique/adversarial.ts`
  (adversarial.ts imports FROM `@deep-agents/core`, not the other way).

## Concepts covered

- **Adversarial prompt testing:** Prompting an agent to take an action (write to a
  protected path) that its middleware should deny. The key distinction: absence of a
  `write_file` call means _model alignment refused the prompt_, not enforcement.
  Enforcement evidence requires `writeAttempted=true` AND `permissionDeniedInTrace=true`.
  This standard was established in T-DA-05 / DDR-008.

- **Static schema assertion (Test 1b):** Inspecting `graph.options.middleware` at
  import time rather than running a live call. Validates the harness assembly
  invariants — `_ToolExclusionMiddleware` present, `execute` absent, single
  `FilesystemMiddleware` — without consuming API quota.

- **Budget enforcement in `beforeModel`:** `ThreadBudgetMiddleware.beforeModel` reads
  `process.env['THREAD_BUDGET_USD']` at every model call, so the test can lower the
  budget for a single test case by setting the env var before invoke and restoring it
  in `finally`. The error object uses `Object.assign(new Error(...), { code: ... })`
  so LangGraph's wrapping must be handled: `isBudgetError()` checks `.code`,
  `.error.code`, and the message string.

- **Data exposure prevention:** Ensuring that API key values never reach message
  content or the Vite JS bundle. The Vite proxy approach (T-FS-03 follow-on) means
  `AUTH_TOKEN` never has a `VITE_` prefix and cannot appear in the bundle.
  `OPENAI_API_KEY` stays server-side; the test asserts it does not leak into any
  message returned by the agent.

- **Vitest config layering:** Three configs coexist — `vitest.config.ts` (unit),
  `vitest.integration.config.ts` (integration), `vitest.e2e.config.ts` (e2e). The
  root config's `exclude` array must list the e2e path or `pnpm test` picks up
  live-API tests and fails in CI.

- **Operations runbook:** A runbook is the authoritative reference for on-call
  response. It must be written before an incident, not during one. The four sections
  (incident, rotation, rollback, health) match the minimum viable runbook for any
  LLM-backed service.

## Decisions and reasons

**Direct `graph.invoke()` over HTTP SDK for e2e tests.**
The DoD language ("both servers must be running") could imply HTTP. Using
`graph.invoke()` directly was chosen because: (a) it matches the existing
`scripts/smoke-permissions.ts` pattern, (b) `ThreadBudgetMiddleware` reads `process.env`
at call time so env-var override works without restarting a server, (c) eliminates a
server-startup race condition in CI. The HTTP smoke tests (`pnpm smoke-server`,
`pnpm smoke-permissions`) cover the server layer independently.

**`isBudgetError()` multi-shape check.**
LangGraph may wrap errors in an `{ error: ... }` envelope depending on the execution
path (direct invoke vs server SSE). Checking all three patterns
(`.code`, `.error.code`, message substring) ensures the test is resilient to wrapping
changes across deepagents versions without requiring `instanceof` checks.

**Inconclusive = not a failure.**
A test run where the model refuses both adversarial prompts is logged to stderr as
INCONCLUSIVE and returns (passes) rather than failing. This matches the T-DA-05
evidence standard: prompt alignment and middleware enforcement are independent;
absence of a tool call proves neither. `pnpm smoke-permissions` covers the
enforcement path with a script that exits non-zero on inconclusive.

## Evidence of completion

```text
$ pnpm test
 Test Files  12 passed (12)
      Tests  116 passed (116)    ← unit tests
 Test Files  3 passed  (3)
      Tests  85 passed (85)      ← web component tests

$ pnpm typecheck
(no output — clean)
```

```text
$ grep -n "^describe(" experiments/__tests__/e2e/adversarial.test.ts
39:describe('Test 1 — filesystem permission enforcement', () => {
123:describe('Test 1b — task tool absent from schema', () => {
148:describe('Test 2 — per-thread cost budget enforcement', () => {
190:describe('Test 3 — data exposure', () => {
```

```text
$ grep "^## " docs/runbook.md
## 1. Incident response
## 2. Key rotation
## 3. Rollback
## 4. Health check
```

```text
$ node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); \
  console.log(p.scripts['test:e2e'])"
node --env-file=.env node_modules/vitest/dist/cli.js run --config vitest.e2e.config.ts --reporter=verbose
```

Setup for a live run (requires API keys and running server):

```bash
pnpm dev:server          # Terminal 1 — LangGraph agent at localhost:2024
pnpm test:e2e            # Terminal 2 — runs all four test groups
```

## Gotchas / lessons learned

- **e2e tests must be excluded from root vitest config.** If `experiments/__tests__/e2e/**`
  is not listed in the root `vitest.config.ts` `exclude` array, `pnpm test` will
  attempt to run the live-API tests in CI with no API keys, fail, and block every
  commit hook. Add the exclusion before adding any new e2e test file.

- **`graph.options` is not typed in `deepagents@1.14.1`.** The middleware inspection
  in Test 1b requires casting to `Record<string, unknown>`. `dump-tools.ts` uses the
  same cast and is the canonical reference for this pattern.

- **`ThreadBudgetMiddleware` fires after the FIRST model call,** not before it.
  `beforeModel` checks cost = 0 on the first call (passes), `afterModel` accumulates
  cost, then `beforeModel` on the second call throws. A test with `THREAD_BUDGET_USD=0.002`
  should expect at least one model call to complete before the error is raised — do
  not assert the error on an empty-message result.

- **`Object.assign(new Error(...), { code: ... })` vs `class` errors.** LangGraph
  may re-wrap thrown errors in SSE mode. The multi-shape `isBudgetError()` helper
  handles this; a plain `err.code === 'THREAD_BUDGET_EXCEEDED'` check would be
  fragile across execution contexts.
