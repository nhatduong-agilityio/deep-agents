# Architecture: module map

This is a short map of an existing codebase. The design decisions and their reasons are in `docs/decisions/` (DDR-001 to DDR-016), and the diagrams are in `docs/diagrams/`.

## Runtime flow

```text
Browser (apps/web, Vite :5173)
  └─ /api proxy (vite.config.ts injects Authorization: Bearer AUTH_TOKEN)
       └─ LangGraph Server (langgraphjs dev :2024, langgraph.json)
            ├─ auth: apps/api/src/auth.ts       (DDR-016)
            └─ graph: apps/api/src/agent.ts     (createDeepAgent, OpenAI, ThreadBudgetMiddleware)
                 ├─ /skills/ ← skills/policy-report/SKILL.md
                 └─ /corpus/ ← corpus/*.txt
```

## Modules

```text
apps/
  api/src/
    agent.ts        ← createDeepAgent export `graph` for LangGraph Server (T-FS-01)
    auth.ts         ← custom auth handler `auth` (DDR-016, Option A); timing-safe Bearer check
  web/
    src/App.tsx     ← chat UI: useStream, 7 features (T-FS-02)
    src/TodoPanel.tsx, src/FilesPanel.tsx ← memo panels for agent todos/files
    src/__tests__/  ← React Testing Library component tests (useStream mocked)
    e2e/            ← Playwright end-to-end tests (needs both dev servers + API keys)
packages/
  core/src/         ← @deep-agents/core, shipped as TS source (no build step)
    index.ts        ← barrel: re-exports all shared utilities
    backoff.ts      ← exponential backoff on 429 (T-DA-01)
    counter.ts      ← 4-dimension run counter: tokens/cost/time/tool-calls (T-DA-01)
    fs-middleware.ts ← makeFilesystemMiddleware (accepts AnyBackendProtocol)
    langsmith.ts    ← LangSmith client (shared)
    subagents.ts    ← RESEARCH_SUBAGENT, SUBAGENTS constants
    tool-args.ts    ← extractToolFilePath helper
experiments/
  __tests__/        ← root vitest unit tests (offline); e2e/ needs API keys (pnpm test:e2e)
  scaffold/         ← T-DA-01 scaffold run + smoke
  planning-first/   ← T-DA-02 baseline, treatment, run
  artifact-agent/   ← T-DA-03 artifact agent + run script
  context-isolation/ ← T-DA-04 config-a, config-b, measure
  critique/         ← T-DA-05 critic, producer, supervisor, hash-guard, feedback-coverage
  harness/          ← T-DA-06 v2 deep-agent harness + context-pruning
  trace-analysis/   ← T-DA-07 scorer + run
scripts/
  check-report.ts   ← deterministic report checker (T-DA-03)
  dump-subagents.ts ← dump sub-agent specs
  dump-tools.ts     ← tool-list assertions (execute absent, FilesystemMiddleware×1)
  render-diagrams.mjs ← Mermaid → docs/diagrams/img/*.svg (pnpm diagrams)
  smoke-permissions.ts ← permission enforcement smoke test (T-FS-01)
  smoke-server.ts   ← LangGraph Server SSE smoke test
skills/policy-report/SKILL.md ← the agent's runtime skill (not a Claude Code skill)
corpus/             ← fixed AI-regulation texts (EU AI Act, US EO 14110) — T-DA-03
benchmark/          ← 20-problem TS subset + isolated runner — T-DA-06
results/            ← committed per-experiment JSON measurements (outputs, not source)
reports/            ← task reports + phase report (historical record)
docs/
  tasks.md          ← canonical task list with DoD
  PROGRESS.md       ← resume point + activity log
  decisions/        ← DDR-001 through DDR-016
  security.md, deploy.md, runbook.md
langgraph.json      ← LangGraph Server manifest (points to apps/api/src/agent.ts)
Dockerfile, docker-compose.yml ← production API image (+ Redis, Postgres, optional llm-guard)
```

## Generated or local-only (never edit by hand)

- `.langgraph_api/`: dev-server state (gitignored)
- `dist/`, `apps/web/dist/`: build output
- `docs/diagrams/img/`: regenerate with `pnpm diagrams`
- `.husky/_/`: husky internals
- `pnpm-lock.yaml`: change only through `pnpm`
