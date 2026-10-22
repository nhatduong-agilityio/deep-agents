# Deployment Guide

Three deployment paths for the Policy Analyst Agent:

| Path                                              | Use case                                 |
| ------------------------------------------------- | ---------------------------------------- |
| [LangSmith Deployments](#1-langsmith-deployments) | Managed hosting, zero infra              |
| [Self-hosted Docker](#2-self-hosted-docker)       | Full control, own infrastructure         |
| [Frontend only](#3-frontend-vite-build)           | Static site to Vercel / Cloudflare Pages |

---

## Runtime secrets

All secrets are injected at container runtime. **Never bake them into the image** (T-FS-00 threat 3).

| Variable                 | Required    | Purpose                                                       |
| ------------------------ | ----------- | ------------------------------------------------------------- |
| `OPENAI_API_KEY`         | Yes         | Primary LLM (gpt-5.4-mini-2026-03-17)                         |
| `LANGSMITH_API_KEY`      | Yes         | Tracing + LangSmith Deployments auth                          |
| `LANGSMITH_PROJECT`      | No          | Defaults to `deep-agents-phase`                               |
| `LANGSMITH_TRACING`      | No          | Defaults to `true`                                            |
| `THREAD_BUDGET_USD`      | No          | Per-thread cost cap; defaults to `0.10`                       |
| `AUTH_TOKEN`             | No          | Bearer token for the API; leave unset to allow all (dev only) |
| `POSTGRES_URI`           | Self-hosted | Checkpointer database                                         |
| `REDIS_URI`              | Self-hosted | Pub/sub for SSE streaming                                     |
| `LANGGRAPH_ALLOW_ORIGIN` | Self-hosted | CORS origin for the production frontend URL                   |

---

## Persistence (VERIFY resolved — T-FS-03)

| Environment               | Checkpointer                                                  | Pub/sub                               |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| `langgraphjs dev` (local) | `InMemorySaver` → `.langgraphjs_api.checkpointer.json` in CWD | In-process                            |
| Production Docker image   | **PostgreSQL** (`pgvector/pgvector:pg16`) via `POSTGRES_URI`  | **Redis** (`redis:6`) via `REDIS_URI` |

Thread history and state survive container restarts in production because PostgreSQL is a persistent volume. Local dev state is lost when the process restarts.

---

## 1. LangSmith Deployments

Managed hosting. LangSmith provisions the container, database, and Redis automatically.

**Prerequisites:**

- `LANGSMITH_API_KEY` set in your environment
- LangSmith account with Deployments enabled

```bash
# Deploy (runs from project root)
pnpm exec langgraphjs deploy

# Redeploy after code changes
pnpm exec langgraphjs deploy --recreate
```

After deployment, LangSmith provides the API URL. Set it as `VITE_API_URL` in the frontend build (see [Frontend](#3-frontend-vite-build)).

**Auth with LangSmith Deployments:** LangSmith manages auth at the infrastructure layer — the `AUTH_TOKEN` check in `apps/api/src/auth.ts` is bypassed for LangSmith-hosted deployments unless you explicitly configure it.

---

## 2. Self-hosted Docker

### Build the image

```bash
# Generate the Dockerfile (already committed — only re-run if langgraph.json changes)
pnpm exec langgraphjs dockerfile Dockerfile

# Build — tag with the git SHA (rollback depends on it, see docs/runbook.md §3), then move `latest`
docker build -t deep-agents:$(git rev-parse --short HEAD) .
docker tag deep-agents:$(git rev-parse --short HEAD) deep-agents:latest
```

> **Back up first.** Rolling back the image does not roll back the database (`langgraph-data` volume, named `<project>_langgraph-data` by Compose). Take a
> backup before every deploy that may change the schema; the runbook's restore reads `langgraph-data.dump`.
> TODO: the backup command is not agreed yet; record the team's command here.

### Configure secrets

Copy `.env.example` to `.env` and fill in required values:

```bash
cp .env.example .env
# Edit .env — set OPENAI_API_KEY, LANGSMITH_API_KEY, AUTH_TOKEN, LANGGRAPH_ALLOW_ORIGIN
```

Minimum `.env` for self-hosted production:

```
OPENAI_API_KEY=sk-...
LANGSMITH_API_KEY=ls__...
AUTH_TOKEN=<strong-random-token>
LANGGRAPH_ALLOW_ORIGIN=https://your-frontend.example.com
```

### Run with Docker Compose

```bash
docker compose up
```

This starts three services:

- `langgraph-postgres` — PostgreSQL with pgvector (checkpointer)
- `langgraph-redis` — Redis (SSE pub/sub)
- `langgraph-api` — the agent server, exposed on port `2024`

The API is available at `http://localhost:2024`.

### Production CORS

The `Dockerfile` bakes the CORS config from `langgraph.json` into the image at build time as the `LANGGRAPH_HTTP` env var. For production, `docker-compose.yml` overrides this at runtime using `LANGGRAPH_ALLOW_ORIGIN`:

```yaml
LANGGRAPH_HTTP: '{"cors":{"allow_origins":["${LANGGRAPH_ALLOW_ORIGIN}"]}}'
```

Set `LANGGRAPH_ALLOW_ORIGIN` in `.env` to your deployed frontend URL. The localhost origin in `langgraph.json` is for `langgraphjs dev` only and must not appear in the production override.

### Auth headers (DDR-016)

The API uses a bearer token (`AUTH_TOKEN`). Every request from the frontend or any client must include:

```
Authorization: Bearer <AUTH_TOKEN>
```

**Never put the token in the frontend bundle.** No `VITE_*` variable may hold a token: Vite inlines every `VITE_*` value into the built JS, where anyone can read it (`CLAUDE.md` hard constraints, T-FS-00 threat 3). The header is always added server-side:

- **Local dev:** the Vite dev server's `/api` proxy (`apps/web/vite.config.ts`) reads `AUTH_TOKEN` from `.env` and sets the header on each proxied request.
- **Production (static build):** the Vite proxy does not exist, so put a BFF / reverse proxy (Nginx, Caddy, Cloudflare Worker) in front of the API and inject the header there:

```nginx
proxy_set_header Authorization "Bearer $AUTH_TOKEN";
```

### Verify the deployment

```bash
# Health check (docs/runbook.md §4). With AUTH_TOKEN set, /ok and the API routes need the bearer token;
# /info answers without auth but returns server version info only (no graph list).
curl -sf http://localhost:2024/ok -H "Authorization: Bearer $AUTH_TOKEN"   # {"ok":true}
curl -sf -X POST http://localhost:2024/assistants/search \
  -H "Authorization: Bearer $AUTH_TOKEN" -H 'Content-Type: application/json' \
  -d '{"graph_id":"agent","limit":1}' | grep -q '"graph_id":"agent"' && echo "agent graph registered"

# Smoke test (requires VITE_API_URL=http://localhost:2024 and AUTH_TOKEN in env)
pnpm smoke-server
pnpm smoke-permissions
```

---

## 3. Frontend: Vite build

The frontend (`apps/web`) is a static Vite build — it can be deployed to any CDN.

### Build

```bash
# Set the production API URL before building
VITE_API_URL=https://your-api.example.com pnpm --filter web build
# Output: apps/web/dist/
```

### Deploy to Vercel

```bash
# From apps/web/
npx vercel --prod
# Set VITE_API_URL in Vercel project environment variables
```

### Deploy to Cloudflare Pages

```bash
# From apps/web/
npx wrangler pages deploy dist --project-name deep-agents-web
# Set VITE_API_URL in Pages environment variables
```

### CORS prerequisite

The production frontend origin (e.g., `https://deep-agents-web.pages.dev`) must be in `LANGGRAPH_ALLOW_ORIGIN` on the API side before deploying the frontend. Otherwise the browser will reject all SSE connections.

---

## 4. Cost monitoring

### Per-thread budget (already enforced)

`ThreadBudgetMiddleware` (T-FS-01) accumulates token cost per thread in LangGraph state. When the thread exceeds `THREAD_BUDGET_USD` (default `$0.10`), the next model call throws `THREAD_BUDGET_EXCEEDED`. The frontend displays a friendly message and stops the UI.

### Monthly budget alert

Set a hard monthly spend limit in the OpenAI project settings:

1. Go to `platform.openai.com` → **Billing** → **Usage limits**
2. Set a **Hard limit** at your monthly cap (e.g., `$10`)
3. Set a **Soft limit** at 80% to receive an email alert before the hard limit is hit

### Weekly usage query (LangSmith)

Query the LangSmith usage API to track token spend across all threads:

```bash
# Weekly token summary (requires LANGSMITH_API_KEY)
curl -H "x-api-key: $LANGSMITH_API_KEY" \
  "https://api.smith.langchain.com/api/v1/runs?project_name=deep-agents-phase&start_time=$(date -v-7d +%Y-%m-%dT00:00:00Z)&select=total_tokens,prompt_tokens,completion_tokens" \
  | jq '[.[] | .total_tokens] | add'
```

### Per-user rate limiting

Two approaches depending on deployment path:

| Approach                        | When to use                                                                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI project quota**        | Create a separate OpenAI project per user/tenant; each project has its own `OPENAI_API_KEY` with its own spend limit                                                                           |
| **Request throttle at API/BFF** | Single OpenAI project; add a rate-limiter middleware in front of `langgraph-api` (e.g., `nginx limit_req`, Cloudflare rate limiting, or an Express gateway) keyed on the `Authorization` token |

For the current single-user deployment (policy analyst agent), the per-thread budget + monthly hard limit is sufficient.
