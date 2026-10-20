# CLAUDE.md — deep-agents-phase

## Project

TypeScript + DeepAgents + LangSmith curriculum project: a policy-analyst agent on LangGraph with a React chat UI.
Goal: produce three evidence outputs (planning trace, artifact report, context isolation proof)
by 2026-10-16 using the `deepagents` harness on LangGraph.
Business context, scope and open questions: `docs/PROJECT_BRIEF.md`. Backlog: `docs/BACKLOG.md`.
Module map: `docs/architecture.md`. Path-scoped conventions: `.claude/rules/`.

## Commands

```bash
pnpm install          # Node 24, pnpm 11 — never npm or yarn
pnpm typecheck        # tsc --noEmit (run before every commit)
pnpm lint             # eslint experiments/ packages/ scripts/ — does NOT cover apps/ (lint-staged does)
pnpm test             # vitest run (root) + pnpm --filter web test — offline, no API keys
pnpm exec vitest run <file>                  # one root test file (prefer over the full suite)
pnpm --filter web exec vitest run <file>     # one web test file, e.g. src/__tests__/App.test.tsx
pnpm build            # tsc → dist/ (delete dist/ afterwards, see Gotchas)
pnpm format           # prettier --write .
pnpm dev:server       # langgraphjs dev → serves agent at localhost:2024 (T-FS-01+)
pnpm dev:web          # pnpm --filter web dev → Vite frontend at localhost:5173 (T-FS-02+)
pnpm test:e2e         # adversarial agent tests — needs OPENAI_API_KEY + LANGSMITH_API_KEY in .env
pnpm dump-tools       # tsx scripts/dump-tools.ts — assert tool list
pnpm smoke-server     # tsx scripts/smoke-server.ts — live server smoke test
pnpm smoke-permissions # tsx scripts/smoke-permissions.ts — permission enforcement
```

## Task workflow

Use slash commands for all task work:

- `/start-task <ID>` — reads task from `docs/tasks.md`, plans, waits for "go"
- `/finish-task <ID>` — verifies DoD with real evidence, writes report, advances progress
- `/ddr <topic>` — creates a Design Decision Record in `docs/decisions/`
- `/standup [since]` — read-only Yesterday / Today / Blockers from git log, open PRs and `docs/PROGRESS.md`
- Backlog/BA tickets (e.g. GitLab #8, #9): `/devkit:task <item>`; specs live in `docs/tasks/<ID>-<slug>/SPEC.md`
- Other changes: `/devkit:plan` → `/devkit:cook` → `/devkit:ship`; plans live in `plans/`

Current resume point: see `docs/PROGRESS.md`.

## Git & review

- Integration branch is `deep-agents` (GitLab `main` holds only the README). Branch from it: `fix/<slug>`, `feat/<slug>`, `chore/<slug>`, `docs/<slug>`
- Conventional Commits (commitlint + husky); bug fixes go test-first: failing `test:` commit, then `fix:`
- Remote `origin` is self-hosted GitLab (MRs, not PRs); MR template: `.gitlab/merge_request_templates/Default.md`
- Remote `github` (`nhatduong-agilityio/deep-agents`, **public**): its `main` mirrors GitLab `deep-agents`. `.claude/` tooling changes go there as GitHub PRs into `main` (same template sections); app work stays on GitLab. The two can drift; after a GitHub merge, bring it to GitLab `deep-agents` via an MR (ask first)
- Before reporting done: every AC/goal has evidence (test names + results, command + output, screenshot)
- Every PR links a devkit PR report artifact under `## Full report` (built from command output via `render-report.mjs`), whichever command opened the PR
- Never push without approval
- When compacting: keep the SPEC/plan path in progress, the modified files, and the test commands in use

## Hard constraints

- **Never use Qwen3 on Groq in multi-turn tool-calling loops** — breaks function calling with `BadRequestError`
- **All deps pinned exact** — no `^` or `~`; run `npm show <pkg> version` before adding anything
- **Primary model** — `openai:gpt-5.4-mini-2026-03-17`; pinned snapshot ID used in all measured runs. Pricing: $0.75/$4.50 per 1M tokens (input/output). No `geminiToolFilter` or `todoListMiddleware` needed for OpenAI models.
- **Groq** = single-call roles only (LLM judge, summarization)
- **Custom middleware NOT inherited by sub-agents** — `mergeMiddlewareStack` uses `appendNew:false`; parent middleware is NOT passed to sub-agents spawned via `task` tool. Sub-agents get the default stack only. Inject middleware explicitly per-run if needed.
- **LangSmith** is the tracer — not LangFuse. Auto-traces when `LANGSMITH_TRACING=true` (canonical); legacy `LANGCHAIN_TRACING_V2=true` also works
- **Sequential runs** — no parallel API calls; back off on HTTP 429; count model calls per run
- **No secrets in the web bundle** — never put tokens in `VITE_*` vars; the Vite `/api` proxy injects `AUTH_TOKEN` server-side

## Stack

| Layer             | Package                    | Version            |
| ----------------- | -------------------------- | ------------------ |
| Agent harness     | `deepagents`               | `1.14.1`           |
| Graph runtime     | `@langchain/langgraph`     | `1.4.18`           |
| Primary model     | `@langchain/openai`        | `1.6.2`            |
| Single-call model | `@langchain/groq`          | `1.3.1`            |
| Tracing           | `langsmith`                | `0.10.7`           |
| Server            | `@langchain/langgraph-api` | `1.5.1`            |
| Frontend          | `@langchain/react` + Vite  | `1.2.3` + `8.3.3`  |
| Tests             | Vitest + RTL + Playwright  | `5.0.3` + `1.64.0` |
| Runtime           | Node 24 / pnpm 11          | —                  |

## Claude Code setup (`.claude/`)

- `settings.json` — permissions (`.env*` reads denied) and hooks: `block-forbidden-command` before every Bash call (best effort: blocks hook-skipping commits/pushes, pushes to `main`/`deep-agents`, `git reset --hard`, common shell reads of `.env*`; exit 2 + reason; table test `.claude/hooks/block-forbidden-command.test.sh`); `pnpm typecheck && pnpm lint` before every `git commit` (blocks on failure); Prettier on every Edit/Write; context restored after compact/resume
- `rules/` — path-scoped conventions for `apps/web`, Node code and tests
- `agents/ui-verifier.md` — checks UI ACs in a real browser (needs both dev servers running)
- `skills/verify/` — project verify recipe; `skills/release-checklist/` — release steps (gate, secrets by name, API-before-frontend deploy, health/smoke, rollback), stops before every deploy/push/tag; `skills/review-checklist/` — review order (correctness → tests → readability → security basics → scope), every suspicion proved by a probe, read-only. All three are tracked via `!` exceptions in `.gitignore`; any other skill under `.claude/skills/` is machine-local and gitignored
- GitLab MCP is per user, not in the repo: `claude mcp add -s user --transport http GitLab https://gitlab.asoft-python.com/api/v4/mcp`, then `/mcp` to sign in (needs the instance's "Allow access to the MCP server" setting); personal settings go in `.claude/settings.local.json`

## Key patterns (from agentic-design.ai)

- **PTR** (Plan & TODO Recitation) — `write_todos` recitation; cap at ≤10 items to control token overhead
- **FSC** (Filesystem as Context) — large payloads → disk/state; only paths in messages
- **CIP** (Context Isolate) — `task` tool spawns fresh-context sub-agents; measured in T-DA-04
- **BGA** (Budget-Guarded Autonomy) — counter tracks tokens + cost + time + tool-call count pre-step
- **BRC** (Blast-Radius Containment) — critic agent gets read-only tools only (`read_file`, `ls`, `glob`, `grep`)
- **CETC** (Tool-Result Clearing) — clears stale tool results mid-run; ~84% token reduction on long loops
- **Think Tool** — no-op tool that forces mid-trajectory verification before irreversible actions

## Coding conventions

- ESM, `NodeNext` module resolution, explicit `.js` extensions on relative imports (also in `apps/web` TSX)
- Named exports only — no default exports from utilities
- Comments: one line max, WHY only — never WHAT
- Process env: always bracket notation `process.env['KEY']`
- No defensive try/catch on internal code — validate at boundaries only
- All artifacts in English: code, comments, commits, plans, specs, MR descriptions, docs

## Removed / reversed

- None yet: one line per reversed decision, newest first (`YYYY-MM-DD — removed/reversed X: why`)

## Gotchas

- `langgraphjs dev` reads `.env` only at startup — restart `pnpm dev:server` after changing keys
- Failed agent runs still return HTTP 200 with an `__error__` field; check the body, not the status
- `pnpm build` writes `dist/`, and root vitest then also runs the compiled tests (incl. e2e, needs keys) — `rm -rf dist` after building
- `docs/CODING-STANDARDS.md` is partly stale (says Gemini, `src/__tests__`, "no mocking"); this file and `.claude/rules/` win
