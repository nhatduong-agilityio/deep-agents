# Report: T-FS-02 — Frontend: Vite + React + `useStream`

**Date completed:** 2026-10-08

## What was done

- Added `packages: ['apps/*']` to `pnpm-workspace.yaml` (above existing `allowBuilds` section).
- Created `apps/web/` as a pnpm workspace package with:
  - `package.json` — all 10 deps pinned exact (react 19.3.0, @langchain/react 1.2.3, vite 8.3.3, etc.)
  - `tsconfig.json` — ESNext module, Bundler resolution, react-jsx, DOM libs, `vite/client` types
  - `vite.config.ts` — React plugin + vitest jsdom env with `e2e/**` excluded
  - `index.html` — Vite entry point
  - `src/main.tsx` — React root mount
  - `src/App.tsx` — all 7 required UI features (see below)
  - `src/__tests__/App.test.tsx` — 9 component tests via React Testing Library
  - `e2e/chat.spec.ts` — Playwright e2e test (live servers required)
  - `.env.example` — documents `VITE_API_URL` as optional, warns against embedding secrets
  - `README.md` — dev setup, component test, and e2e instructions
- Added `"dev:web": "pnpm --filter web dev"` to root `package.json`.
- Updated root `package.json` `"test"` script to `"vitest run && pnpm --filter web test"`.
- Verified: `pnpm test` runs 116 root tests + 9 web tests (125 total, all pass).
- Verified: `pnpm smoke-server` against running LangGraph Server — 25 events streamed.

## Concepts covered

- **`useStream` hook (`@langchain/react`):** Manages the SSE connection to the LangGraph Server. Returns `{ messages, toolCalls, isLoading, error, threadId, submit, stop }`. `submit()` takes a partial state update (e.g., `{ messages: [{ type: 'human', content }] }`); `stop()` cancels the current run. The hook owns thread lifecycle — `threadId` persists across calls in the same component instance.

- **`react-markdown` for safe rendering:** Renders model output as markdown without allowing raw HTML injection. The default config strips `<script>`, `<iframe>`, and all inline `on*` handlers — safe for untrusted model output without additional sanitization.

- **pnpm workspace packages:** Adding `packages: ['apps/*']` to `pnpm-workspace.yaml` makes `apps/web` a first-class workspace member. `pnpm --filter web <cmd>` targets it by the `name` field in its `package.json`. Root `pnpm test` chains both test suites.

- **Vitest jsdom environment for React:** Root `vitest.config.ts` covers `src/` only. `apps/web/vite.config.ts` adds `test: { environment: 'jsdom' }` for DOM APIs. The `e2e/**` exclusion is required — Playwright's `test()` function conflicts with Vitest's if not excluded.

- **`THREAD_BUDGET_EXCEEDED` error handling:** `useStream` surfaces errors as an `error` object. The code checks both `error.code` (direct throw) and `error.error.code` (langgraph-sdk wrapping). The friendly message is keyed to the error code, not message text, so it survives model version changes.

- **`VITE_*` env vars are public:** `VITE_API_URL` is the only `VITE_*` var. All API keys stay server-side and are never exposed in the Vite bundle. This is a hard constraint from T-FS-00 / `docs/security.md`.

## Decisions and reasons

**`react-markdown` over `dangerouslySetInnerHTML`:** Model output must be treated as untrusted input. `react-markdown` parses markdown and renders a React tree — no raw HTML path. The alternative (string parsing + sanitizer like DOMPurify) adds a dependency and a misconfiguration surface.

**`useStream` mock cast via `as unknown as ReturnType<typeof useStream>`:** `UseStreamReturn` has ~15 properties. A minimal mock object fails strict overlap. Double-casting via `unknown` avoids maintaining a full mock shape while keeping the type assertion explicit. This is the standard pattern when mocking third-party hook returns.

**Vitest `globals: true` in `vite.config.ts`:** Avoids importing `describe`/`it`/`expect` in every test file. Consistent with the root vitest config.

## Evidence of completion

**Component tests (9/9):**

```
 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  14:43:27
   Duration  996ms
```

**Root test suite (116 + 9 = 125 total):**

```
 Test Files  12 passed (12)
      Tests  116 passed (116)
...
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

**End-to-end smoke (live server at localhost:2024):**

```
Connecting to LangGraph Server at http://localhost:2024
First event type: metadata
PASS: received 25 event(s) from http://localhost:2024/agent
```

**Files produced:**

- `apps/web/src/App.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/__tests__/App.test.tsx`
- `apps/web/e2e/chat.spec.ts`
- `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`
- `apps/web/index.html`, `apps/web/.env.example`, `apps/web/README.md`

## Gotchas / lessons learned

- **Playwright picked up by Vitest:** `e2e/chat.spec.ts` uses Playwright's `test()` which errors when Vitest tries to run it. Fix: add `exclude: ['e2e/**']` to `vite.config.ts` test config. The root vitest config also needs `exclude: ['apps/**']` or the workspace's own config takes precedence.

- **`import.meta.env` TypeScript error:** `Property 'env' does not exist on type 'ImportMeta'` unless `"types": ["vite/client"]` is in `tsconfig.json`. The error is silent during dev (Vite handles it) but fails `pnpm typecheck`.

- **`pnpm typecheck` recursive issue:** After adding the workspace, the root `pnpm typecheck` tries to run recursively. Use `npx tsc --noEmit` directly for root-only typecheck, or add `-w` flag scoping. The PostToolUse hook runs `pnpm typecheck` — monitor for false positives after workspace setup.

- **`FormEvent` deprecation:** `React.FormEvent` is deprecated in React 19 types. Replace with the DOM native `SubmitEvent` or type the handler as `(e: React.SyntheticEvent<HTMLFormElement>) => void` in a future cleanup.

- **LangGraph Server CORS for Brave/Cloudflare tunnel:** When testing Studio via `--tunnel`, the Cloudflare domain must be added to `allow_origins` in `langgraph.json`. Also added `https://smith.langchain.com` for Studio SSE connections.
