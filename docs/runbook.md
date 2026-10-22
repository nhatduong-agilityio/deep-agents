# Operations Runbook — deep-agents

## 1. Incident response

### Agent errors or unexpected output

1. **Open LangSmith** → project `deep-agents-phase` → find the failing run by timestamp or thread ID.
2. Expand the trace: look for `beforeModel` / `afterModel` spans with error status. Common causes:
   - `THREAD_BUDGET_EXCEEDED` — `threadCostUsd` exceeded `THREAD_BUDGET_USD`. Not a crash; the middleware throws intentionally.
   - Permission-denied tool result — agent attempted a write outside allowed paths. Expected for adversarial prompts; unexpected if a normal policy query triggers it.
   - OpenAI HTTP 429 — rate-limit hit. Check the `retryWaitMs` field in the span metadata.
3. **Check container logs** (self-hosted):
   ```bash
   docker compose logs -f langgraph-api
   ```
   Look for startup errors (missing env var, failed DB connection) vs runtime errors (5xx during a run).
4. **Check LangGraph API health:**
   ```bash
   curl -s http://localhost:2024/ok -H "Authorization: Bearer $AUTH_TOKEN"
   # Expected: {"ok":true}. Without the token: 401 on `langgraphjs dev`, but 200 on the Docker image, so check auth on a
   # protected route (POST /threads without the token → 401).
   curl -s http://localhost:2024/info
   # Expected: {"version":"...","langgraph_js_version":"...",...} (no auth needed; no graph list)
   ```
5. **Reproduce locally** using the thread ID from LangSmith:
   ```bash
   # Get the thread state to inspect accumulated cost and messages
   curl -s http://localhost:2024/threads/<thread_id>/state \
     -H "Authorization: Bearer $AUTH_TOKEN"
   ```

### Budget exhausted mid-conversation

The frontend shows "This conversation has reached its cost limit — please start a new thread."
To raise the budget for a specific deployment:

1. Update `THREAD_BUDGET_USD` in the environment (`.env` locally, container env for Docker).
2. Restart the server (the budget middleware reads the env var at each model call, so a restart is only needed for `langgraphjs dev`; Docker containers restart automatically).

---

## 2. Key rotation

### Rotate `OPENAI_API_KEY`

1. Create a new key in the [OpenAI platform](https://platform.openai.com/api-keys).
2. Update the value in the relevant environment:
   - **Local dev:** edit `.env`, `OPENAI_API_KEY=<new-key>`; restart `pnpm dev:server`.
   - **Docker:** update `.env`, then `docker compose down && docker compose up -d`.
   - **LangSmith Deployments:** update the secret in the deployment settings, then redeploy.
3. Verify the old key is revoked in the OpenAI dashboard.
4. Run the smoke test to confirm the new key works:
   ```bash
   pnpm smoke-server
   ```

### Rotate `LANGSMITH_API_KEY`

1. Create a new key in the [LangSmith settings](https://smith.langchain.com/settings).
2. Update `LANGSMITH_API_KEY` in `.env` (and deployment secrets).
3. Restart the server. Existing traces remain accessible under the project — key rotation does not affect historical data.
4. Verify tracing is active:
   ```bash
   pnpm smoke-server
   # LangSmith trace URL should appear in stdout
   ```

### Rotate `AUTH_TOKEN`

1. Choose a new token (random string, ≥32 chars in production).
2. Update `AUTH_TOKEN` in the server environment.
3. Update `AUTH_TOKEN` in `apps/web/.env.local` (and in any client that sends `Authorization: Bearer`).
4. Restart both the API server and the Vite dev server.

> **Note:** `AUTH_TOKEN` is used for all sessions. If a user is mid-conversation when the token is rotated, their next request will receive a 401. The frontend will display a network error; they should refresh the page.

---

## 3. Rollback

### Self-hosted (Docker)

Each deployment should be tagged with the git SHA:

```bash
docker build -t deep-agents:<git-sha> .
docker tag deep-agents:<git-sha> deep-agents:latest
```

To roll back to a previous image:

```bash
# List available local images
docker images deep-agents

# Roll back
docker compose down
# Edit docker-compose.yml: set image: deep-agents:<previous-sha> instead of build: .
docker compose up -d

# Or rebuild from a specific commit:
git checkout <previous-sha>
docker compose up --build -d
```

**Image names:** `docker-compose.yml` uses `build: .`, so `docker compose up --build` builds and runs
`<project>-langgraph-api` (here `generative-ai-langgraph-api`), not `deep-agents:<sha>`. The SHA tag is only used after
switching the service to `image:` as above. Before a deploy, keep the running image with
`docker tag generative-ai-langgraph-api:latest generative-ai-langgraph-api:pre-<sha>`.

**Database state:** PostgreSQL data is in the `langgraph-data` volume, which Docker Compose names
`<project>_langgraph-data` (here `generative-ai_langgraph-data`; check with `docker volume ls`). Rolling back the image does **not** roll back the database schema. If a migration is involved, restore from a backup before rolling back the image:

```bash
docker compose down
# TODO: untested. pg_restore needs a running server; this command does not start one.
docker run --rm -v generative-ai_langgraph-data:/data -v $(pwd):/backup \
  postgres:16 pg_restore -U postgres -d postgres /backup/langgraph-data.dump
docker compose up -d
```

A file-level snapshot, taken with Postgres stopped (backup used on 2026-10-22; restore not tested yet; one option, not yet the agreed procedure):

```bash
docker run --rm -v generative-ai_langgraph-data:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/langgraph-data-pre-<sha>.tgz -C /data .
# Restore (Postgres stopped): docker run --rm -v generative-ai_langgraph-data:/data -v "$PWD":/backup alpine \
#   sh -c 'rm -rf /data/* && tar xzf /backup/langgraph-data-pre-<sha>.tgz -C /data'
```

### LangSmith Deployments

1. Open the deployment in the [LangSmith Deployments UI](https://smith.langchain.com/deployments).
2. Select **Revisions** → find the last known-good revision → click **Rollback**.
3. Monitor the deployment health indicator until it turns green.

---

## 4. Health check

### Expected responses

| Endpoint             | Method | Expected                                                                                       |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `/ok`                | GET    | `{"ok":true}` — HTTP 200. Without the token: 401 on `langgraphjs dev`, 200 on the Docker image |
| `/info`              | GET    | `{"version":"...","langgraph_js_version":"...",...}` — HTTP 200, no auth, no graph list        |
| `/assistants/search` | POST   | JSON array with an item whose `graph_id` is `agent` (requires the token)                       |
| `/threads`           | POST   | HTTP 200 with new thread ID (requires `Authorization: Bearer <token>`)                         |

Observed 2026-10-19 on `langgraphjs dev` (`@langchain/langgraph-api` 1.5.1) with `AUTH_TOKEN` set: `/ok` returns 401
without the token (`auth.ts` exempts only `OPTIONS`), while the server answers `/info` without running auth.
Observed 2026-10-22 on the Docker image (`langchain/langgraphjs-api:24`, `6453964`) with `AUTH_TOKEN` set: `/ok` returns
**200 without the token**, while `POST /threads` and `POST /assistants/search` return 401 without it or with a wrong one.
So `/ok` proves liveness only; prove auth with a protected route.

### Automated health check

```bash
# Liveness (auth required when AUTH_TOKEN is set)
curl -sf http://localhost:2024/ok -H "Authorization: Bearer $AUTH_TOKEN" | grep '"ok"'

# Readiness: the agent graph is registered (auth required). /info has no graph list, so it can't be used here.
curl -sf -X POST http://localhost:2024/assistants/search \
  -H "Authorization: Bearer $AUTH_TOKEN" -H 'Content-Type: application/json' \
  -d '{"graph_id":"agent","limit":1}' | grep -q '"graph_id":"agent"' && echo "API healthy"
```

### Smoke test suite

```bash
# Live SSE end-to-end (server must be running)
pnpm smoke-server

# Permission enforcement (server must be running)
pnpm smoke-permissions

# Full E2E adversarial + budget tests (server must be running; real API keys required)
pnpm test:e2e
```

### Monitoring

- **Per-thread costs:** query LangSmith usage API weekly; alert if any thread exceeds 10× `THREAD_BUDGET_USD`.
- **Monthly OpenAI spend:** set a hard limit in [OpenAI project settings](https://platform.openai.com/settings/organization/billing) at 2× the expected monthly cost.
- **Rate limits:** if HTTP 429s appear in logs, increase `THREAD_BUDGET_USD` temporarily (forces fewer calls per session) or implement request queuing in the BFF layer.
