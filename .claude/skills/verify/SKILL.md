---
name: verify
description: Verify a change in this repo end to end — typecheck, lint (including apps/web), offline tests, build, and for UI changes a real-browser check of the chat app. Use before reporting a task done or opening an MR.
---

# Verify (generative-ai)

Run from the repo root and report each command with its exit code and key output lines. Stop at the first failure and show it.

1. Static checks
   - `pnpm typecheck`
   - `pnpm lint` (experiments/, packages/, scripts/)
   - `pnpm exec eslint apps/web/src` (`pnpm lint` skips `apps/`)
2. Tests (offline, no API keys)
   - The files you touched first: `pnpm exec vitest run <file>` or `pnpm --filter web exec vitest run <file>`
   - Then the full suite: `pnpm test` (root and web counts both reported)
3. Build: `pnpm build`, then `rm -rf dist` — otherwise the next `pnpm test` also runs the compiled tests in `dist/`, including e2e
4. Formatting of changed files only: `pnpm exec prettier --check <changed files>`. A repo-wide `pnpm format:check` already fails on `apps/web/src/theme.css` and `reports/T-FS-00-report.md`; don't count those.
5. UI changes (anything under `apps/web/src`)
   - Start `pnpm dev:server` and `pnpm dev:web` in the background; wait until `http://localhost:5173` responds. The agent needs real keys in `.env`, and the server reads `.env` only at startup.
   - Use the `ui-verifier` agent with the SPEC's UI acceptance criteria, or drive the flow with `@playwright/test` (`chromium.launch({ channel: 'chrome' })`) from `apps/web`.
   - A failed agent run still returns HTTP 200 with an `__error__` field; check the response body.
6. Agent changes (`apps/api`, `packages/core`): `pnpm test:e2e` calls real APIs and costs money, so ask before running it.

Report a table: step · command · result (pass/fail + evidence).
