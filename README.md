# deep-agents-phase

TypeScript + DeepAgents curriculum project. Demonstrates agentic AI patterns on LangGraph, measured and traced with LangSmith.

**Deadline:** 2026-10-16 — **Three required evidence outputs, all complete.**

| Output                  | Task    | Status     | Evidence                                                    |
| ----------------------- | ------- | ---------- | ----------------------------------------------------------- |
| Planning Trace          | T-DA-02 | `[x]` done | LangSmith trace — `write_todos` first, 10/10                |
| Artifact Report         | T-DA-03 | `[x]` done | `/report/` files + checker 3/3 pass                         |
| Context Isolation Proof | T-DA-04 | `[x]` done | Peak ratio 0.3286 (v2, 8-file corpus); v1 0.5464 documented |

---

## Stack

| Layer             | Package                                         | Version           |
| ----------------- | ----------------------------------------------- | ----------------- |
| Agent harness     | `deepagents`                                    | `1.14.1`          |
| Graph runtime     | `@langchain/langgraph`                          | `1.4.18`          |
| Primary model     | `@langchain/openai` — `gpt-5.4-mini-2026-03-17` | `1.6.2`           |
| Single-call model | `@langchain/groq`                               | `1.3.1`           |
| Tracing           | `langsmith`                                     | `0.10.7`          |
| Server            | `@langchain/langgraph-api`                      | `1.5.1`           |
| Frontend          | `@langchain/react` + Vite                       | `1.2.0` + `8.3.2` |
| Runtime           | Node 24 / pnpm 11                               | —                 |

## Commands

```bash
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint experiments/ packages/ scripts/
pnpm test             # vitest run (root) + pnpm --filter web test
pnpm format           # prettier --write .
pnpm diagrams         # render docs/diagrams/*.md → docs/diagrams/img/*.svg
pnpm dev:server       # langgraphjs dev → localhost:2024
pnpm dev:web          # pnpm --filter web dev → Vite frontend (localhost:5173)
pnpm dump-tools       # assert tool list (execute absent, FilesystemMiddleware×1)
pnpm smoke-server     # live LangGraph Server SSE smoke test
pnpm smoke-permissions # permission enforcement smoke test
```

## Task progress

| ID        | Title                              | Status |
| --------- | ---------------------------------- | ------ |
| T-DA-00   | Project Bootstrap                  | `[x]`  |
| T-DA-00.1 | Initial Decision Records           | `[x]`  |
| T-DA-00.2 | Skills + Claude Code Hooks         | `[x]`  |
| T-DA-01   | Scaffold + Reality Check           | `[x]`  |
| T-DA-02   | Planning-First (Output 2)          | `[x]`  |
| T-DA-03   | Artifact Agent (Output 1)          | `[x]`  |
| T-DA-04   | Context Isolation Proof (Output 3) | `[x]`  |
| T-DA-05   | Critique Workflow                  | `[x]`  |
| T-DA-06   | Harness Optimization Drills        | `[x]`  |
| T-DA-07   | Trace Analysis                     | `[x]`  |
| T-DA-08   | DDR Index + Phase Report           | `[x]`  |
| T-FS-00   | Security Baseline + Auth Decision  | `[x]`  |
| T-FS-01   | LangGraph Server backend           | `[x]`  |
| T-FS-02   | React + `useStream` frontend       | `[x]`  |
| T-FS-02b  | Deep Agents UI: Agent Features     | `[ ]`  |
| T-FS-03   | Dockerfile + Deployment            | `[ ]`  |
| T-FS-04   | E2E Verification + Runbook         | `[ ]`  |

## Directory structure

```
apps/
  api/src/
    agent.ts                  ← createDeepAgent + ThreadBudgetMiddleware
    auth.ts                   ← custom auth handler (DDR-016)
  web/src/
    App.tsx                   ← chat UI: useStream, 7 features (T-FS-02)
    __tests__/                ← React Testing Library tests (9 tests)
    e2e/                      ← Playwright end-to-end tests
packages/
  core/src/                   ← @deep-agents/core — shared utilities
    backoff.ts                ← exponential backoff on 429
    counter.ts                ← 4-dimension run counter (tokens/cost/ms/calls)
    fs-middleware.ts          ← makeFilesystemMiddleware (AnyBackendProtocol)
    langsmith.ts              ← LangSmith client
    subagents.ts              ← RESEARCH_SUBAGENT + SUBAGENTS list
    tool-args.ts              ← extractToolFilePath helper
experiments/
  __tests__/                  ← vitest tests (116 tests)
  artifact-agent/             ← T-DA-03: agent + run script
  context-isolation/          ← T-DA-04: config-a, config-b, measure
  critique/                   ← T-DA-05: critic, producer, supervisor, hash-guard
  harness/                    ← T-DA-06: deep-agent harness + context-pruning
  planning-first/             ← T-DA-02: baseline + treatment runs
  scaffold/                   ← T-DA-01: scaffold run + smoke
  trace-analysis/             ← T-DA-07: scorer + run
scripts/
  check-report.ts             ← deterministic artifact checker
  dump-tools.ts               ← tool-list assertions
  smoke-server.ts             ← LangGraph Server SSE smoke test
  smoke-permissions.ts        ← permission enforcement smoke test
corpus/                       ← fixed AI-regulation docs (EU AI Act, US EO)
skills/policy-report/         ← agent skill: report format + citation rules
benchmark/                    ← 20-problem TS subset (T-DA-06)
results/                      ← JSON run logs per experiment
reports/                      ← task reports (T-DA-00.1 through T-FS-02)
docs/
  tasks.md                    ← canonical task list with DoD
  PROGRESS.md                 ← resume point + activity log
  decisions/                  ← DDR-001 through DDR-016
  diagrams/                   ← Mermaid diagrams + rendered SVGs
  security.md                 ← threat model, path policy, auth decision
  CODING-STANDARDS.md
langgraph.json                ← LangGraph Server manifest (apps/api/src/agent.ts)
```

## Key constraints

- **Primary model:** `openai:gpt-5.4-mini-2026-03-17` — $0.75/$4.50 per 1M tokens
- **Groq:** single-call roles only (judge, summarization) — never Qwen3 in multi-turn loops
- **All deps pinned exact** — no `^` or `~`
- **Custom middleware not inherited by sub-agents** — inject explicitly per-run
- **LangSmith tracing:** set `LANGSMITH_TRACING=true`

## Agentic patterns exercised

| Pattern | Description                                                     | Task    |
| ------- | --------------------------------------------------------------- | ------- |
| PTR     | Plan & TODO Recitation via `write_todos`                        | T-DA-02 |
| FSC     | Filesystem as Context — large payloads to disk                  | T-DA-03 |
| CIP     | Context Isolate — sub-agents cap main-agent peak                | T-DA-04 |
| SVW     | Supervisor-Worker delegation                                    | T-DA-04 |
| BRC     | Blast-Radius Containment — critic read-only + `/feedback/` only | T-DA-05 |
| PC      | Producer-Critic revision loop                                   | T-DA-05 |
| BGA     | Budget-Guarded Autonomy — 4-dim counter pre-step                | T-DA-01 |
| CETC    | Tool-Result Clearing — ~84% token reduction                     | T-DA-06 |
| Think   | Structured Reflection no-op tool                                | T-DA-06 |
| ReWOO   | Plan-Execute Decoupling                                         | T-DA-06 |

## Docs

- [`docs/tasks.md`](docs/tasks.md) — full task list with Definition of Done
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — resume point + findings log
- [`docs/decisions/`](docs/decisions/) — all DDRs
- [`docs/diagrams/`](docs/diagrams/) — architecture and flow diagrams
- [`reports/`](reports/) — per-task evidence reports
