# Policy Analyst Agent — Web Frontend

Vite + React chat UI connecting to the LangGraph Server via `useStream`.

## Development

```bash
# 1. Start the backend (from repo root)
pnpm dev:server

# 2. Start the frontend (from repo root)
pnpm dev:web
# → http://localhost:5173
```

Copy `.env.example` to `.env` if you need a custom server URL:

```bash
cp apps/web/.env.example apps/web/.env
# edit VITE_API_URL if the server runs elsewhere
```

## Component tests

```bash
# From repo root — runs all tests including web component tests
pnpm test

# Or web-only
pnpm --filter web test
```

## End-to-end tests (Playwright)

Requires both dev servers running (see Development above).

```bash
# First run — install browsers once
pnpm --filter web exec playwright install --with-deps chromium

# Run e2e
pnpm --filter web e2e
```

The e2e test sends a real message to the agent and asserts a non-empty reply within 30 s.
It is not wired into CI (requires live API keys); run it locally before releasing.
