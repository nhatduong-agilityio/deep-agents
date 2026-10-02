# CLAUDE.md — deep-agents-phase

## Project

TypeScript + DeepAgents + LangSmith curriculum project.
Goal: produce three evidence outputs (planning trace, artifact report, context isolation proof)
by 2026-10-16 using the `deepagents` harness on LangGraph.

## Commands

```bash
pnpm dev              # run src/index.ts with .env loaded
pnpm typecheck        # tsc --noEmit (run before every commit)
pnpm lint             # eslint src/
pnpm test             # vitest run
pnpm format           # prettier --write .
pnpm dev:server       # langgraphjs dev → serves agent at localhost:2024 (T-FS-01+)
pnpm dev:web          # pnpm --filter web dev → Vite frontend (T-FS-02+)
```

## Task workflow

Use slash commands for all task work:

- `/start-task <ID>` — reads task from `docs/tasks.md`, plans, waits for "go"
- `/finish-task <ID>` — verifies DoD with real evidence, writes report, advances progress
- `/ddr <topic>` — creates a Design Decision Record in `docs/decisions/`

Current resume point: see `docs/PROGRESS.md`.

## Hard constraints

- **Never use Qwen3 on Groq in multi-turn tool-calling loops** — breaks function calling with `BadRequestError`
- **All deps pinned exact** — no `^` or `~`; run `npm show <pkg> version` before adding anything
- **Gemini Flash alias** (`gemini-2.0-flash`) for exploration only; pin versioned ID for all measured runs
- **Groq** = single-call roles only (LLM judge, summarization)
- **No todoListMiddleware** — `write_todos` is built-in by default in `deepagents@1.14.1`; `REQUIRED_MIDDLEWARE_NAMES = { FilesystemMiddleware, SubAgentMiddleware }`
- **LangSmith** is the tracer — not LangFuse. Auto-traces when `LANGCHAIN_TRACING_V2=true`
- **Sequential runs** — no parallel API calls; back off on HTTP 429; count model calls per run

## Stack

| Layer             | Package                    | Version           |
| ----------------- | -------------------------- | ----------------- |
| Agent harness     | `deepagents`               | `1.14.1`          |
| Graph runtime     | `@langchain/langgraph`     | `1.4.18`          |
| Primary model     | `@langchain/google-genai`  | `2.3.2`           |
| Single-call model | `@langchain/groq`          | `1.3.1`           |
| Tracing           | `langsmith`                | `0.10.7`          |
| Server            | `@langchain/langgraph-api` | `1.5.1`           |
| Frontend          | `@langchain/react` + Vite  | `1.2.0` + `8.3.2` |
| Runtime           | Node 24 / pnpm 11          | —                 |

## Installed skills (`.claude/skills/`)

| Skill                            | Source             | Purpose                                                     |
| -------------------------------- | ------------------ | ----------------------------------------------------------- |
| `verification-before-completion` | `obra/superpowers` | Runs typecheck + tests before any DoD item is checked       |
| `systematic-debugging`           | `obra/superpowers` | 4-phase root-cause analysis for broken experiments / traces |
| `subagent-driven-development`    | `obra/superpowers` | 2-stage spec + quality review for sub-agent output          |
| `test-driven-development`        | `obra/superpowers` | RED-GREEN-REFACTOR discipline for unit code                 |
| `requesting-code-review`         | `obra/superpowers` | Dispatches fresh-context review sub-agent before closing    |
| `finishing-a-development-branch` | `obra/superpowers` | Test suite → 4-option merge/PR menu                         |

## PostToolUse hooks (`.claude/settings.local.json` — machine-local, not committed)

| Matcher       | Command                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| `Edit\|Write` | `pnpm typecheck 2>&1 \| head -20` — catches TS errors immediately        |
| `Bash`        | `pnpm eslint <changed .ts files> 2>&1 \| head -20` — lint on file change |

## Key patterns (from agentic-design.ai)

- **PTR** (Plan & TODO Recitation) — `write_todos` recitation; cap at ≤10 items to control token overhead
- **FSC** (Filesystem as Context) — large payloads → disk/state; only paths in messages
- **CIP** (Context Isolate) — `task` tool spawns fresh-context sub-agents; measured in T-DA-04
- **BGA** (Budget-Guarded Autonomy) — counter tracks tokens + cost + time + tool-call count pre-step
- **BRC** (Blast-Radius Containment) — critic agent gets read-only tools only (`read_file`, `ls`, `glob`, `grep`)
- **CETC** (Tool-Result Clearing) — clears stale tool results mid-run; ~84% token reduction on long loops
- **Think Tool** — no-op tool that forces mid-trajectory verification before irreversible actions

## File map

```
src/
  index.ts          ← LangSmith client (shared, import from here)
  agent.ts          ← createDeepAgent export for LangGraph Server (T-FS-01)
  lib/
    backoff.ts      ← exponential backoff on 429 (T-DA-01)
    counter.ts      ← 4-dimension run counter: tokens/cost/time/tool-calls (T-DA-01)
  experiments/      ← one folder per task T-DA-02 through T-DA-07
  scripts/          ← deterministic checker scripts (T-DA-03)
  __tests__/        ← vitest tests
corpus/             ← fixed AI-regulation docs (EU AI Act, US EO) — T-DA-03
benchmark/          ← 20-problem TS subset — T-DA-06
apps/web/           ← Vite React frontend (T-FS-02)
docs/
  tasks.md          ← canonical task list with DoD
  PROGRESS.md       ← resume point + activity log
  decisions/        ← DDR-001 through DDR-010
  CODING-STANDARDS.md
reports/            ← task reports + phase report
langgraph.json      ← LangGraph Server manifest (T-FS-01)
```

## Coding conventions

- ESM, `NodeNext` module resolution, explicit `.js` extensions on relative imports
- Named exports only — no default exports from utilities
- Comments: one line max, WHY only — never WHAT
- Process env: always bracket notation `process.env['KEY']`
- No defensive try/catch on internal code — validate at boundaries only
