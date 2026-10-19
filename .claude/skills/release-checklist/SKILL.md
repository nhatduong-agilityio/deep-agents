---
name: release-checklist
description: Release checklist for deep-agents — the gate, tag, secrets, deploy order, health checks, smoke tests and rollback plan, followed the same way every time. Use before releasing, deploying, shipping to production, tagging a version, building the production Docker image, or running langgraphjs deploy / vercel / wrangler.
---

# Release checklist (deep-agents)

Walk the steps in order and report a table at the end: step · command or check · result (pass/fail/skipped + evidence).
Sources: `docs/deploy.md`, `docs/runbook.md`, `CLAUDE.md`. Where they disagree, `CLAUDE.md` and the runbook win; say so in the report.

**Stop and ask the user before every step marked ⛔.** Those steps deploy, push, tag, cost money, or call real APIs. Without an explicit "go" for that step, stop there and report what is ready. A dry run ("prepare a release", "what would a release need") stops at the first ⛔.

## 1. Gate — before anything is built

1. The working tree is clean (`git status --porcelain` is empty) and you are on the commit being released. Note its SHA with `git rev-parse --short HEAD`. That SHA identifies the release.
2. Run the `verify` skill in full (typecheck, lint, offline tests, build, changed-file formatting). Any failure stops the release.
   After its build step, check that `dist/` is gone (`ls dist` fails). Otherwise the next `pnpm test` also runs compiled e2e tests.
3. Release notes: list the commits since the last release (`git log --oneline <last-release-sha>..HEAD`).
   TODO: the repo has no changelog, version-bump policy or release tags yet. Ask the user where the last release is recorded, and don't invent a version number.

## 2. Secrets — by name only

Ask the user to confirm that each required variable is set **in the target environment** (`docs/deploy.md` "Runtime secrets"). Never read, print, `cat`, `grep` or `source` `.env` files; reads are denied in `.claude/settings.json`.

- Always: `OPENAI_API_KEY`, `LANGSMITH_API_KEY`
- Self-hosted Docker: also `POSTGRES_URI`, `REDIS_URI`, `LANGGRAPH_ALLOW_ORIGIN` (the production frontend URL, not localhost)
- Recommended: `AUTH_TOKEN`. Unset means the API allows every request (dev only).
- Optional: `LANGSMITH_PROJECT`, `LANGSMITH_TRACING`, `THREAD_BUDGET_USD` (default `0.10`)

Never bake secrets into the image. **Never put a token in a `VITE_*` variable** (`CLAUDE.md`, hard constraints).
`docs/deploy.md` "Auth headers" suggests `VITE_AUTH_TOKEN`. That contradicts `CLAUDE.md`, so don't follow it; flag it in the report. The Vite `/api` proxy injects `AUTH_TOKEN` server-side.

## 3. Choose the path and back up

Ask which path: **LangSmith Deployments**, **self-hosted Docker**, and/or **frontend only** (`docs/deploy.md` table).

Before a Docker deploy: back up the `langgraph-data` Postgres volume. Rolling back the image does not roll back the database (`docs/runbook.md` §3).
TODO: no document says how to create the dump that the runbook's restore command reads (`/backup/langgraph-data.dump`). Ask the user how they back it up; don't improvise a `pg_dump` command as if it were the procedure.

## 4. Deploy — API first, then frontend

The frontend's origin must already be in `LANGGRAPH_ALLOW_ORIGIN` on the API before the frontend goes live; otherwise the browser rejects every SSE connection (`docs/deploy.md` "CORS prerequisite").

- **LangSmith** ⛔: `pnpm exec langgraphjs deploy` (`--recreate` for a redeploy). Note the API URL it returns.
- **Docker** ⛔: tag the image with the SHA from step 1, not only `latest`. Rollback depends on the SHA tag (`docs/runbook.md` §3); `docs/deploy.md` builds only `:latest`, so note the difference.
  `docker build -t deep-agents:<sha> . && docker tag deep-agents:<sha> deep-agents:latest`, then `docker compose up -d`.
  Regenerate the `Dockerfile` (`pnpm exec langgraphjs dockerfile Dockerfile`) only if `langgraph.json` changed.
- **Frontend** ⛔: `VITE_API_URL=<api-url> pnpm --filter web build`, then from `apps/web/` `npx vercel --prod` or `npx wrangler pages deploy dist --project-name deep-agents-web`.

## 5. After deploy — health and smoke

Health checks (`docs/runbook.md` §4). `/ok` needs no auth; `/info` needs the bearer token, although `docs/deploy.md` curls it without auth, so follow the runbook:

- `curl -sf <api>/ok` → `{"status":"ok"}`, HTTP 200
- `curl -sf <api>/info -H "Authorization: Bearer $AUTH_TOKEN"` → the `graphs.agent` key is present

Smoke tests ⛔ (they read `.env` and call real APIs, which costs money): `pnpm smoke-server`, `pnpm smoke-permissions`. `pnpm test:e2e` (full adversarial + budget suite) needs a separate "go".

## 6. Rollback plan — written down before you say "done"

Record in the report the previous good SHA or revision and the exact rollback for the chosen path (`docs/runbook.md` §3):

- Docker: `docker compose down`; set `image: deep-agents:<previous-sha>` in `docker-compose.yml`; `docker compose up -d`. If the schema changed, restore the step 3 backup first.
- LangSmith: Deployments UI → Revisions → last known-good → Rollback, then wait for the health indicator to turn green.
- Frontend: TODO, not documented. Redeploy the previous build from the Vercel/Pages dashboard.

## Report

End with the table, the release SHA, the path(s) deployed, which ⛔ steps ran or are still waiting, every TODO you hit, and any document conflicts you found.
