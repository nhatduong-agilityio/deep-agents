# Task Tracker

Tasks are added here during planning sessions. Each task should include: ID,
title, scope (files/concepts touched), and a Definition of Done.

Status markers: `[ ]` not started · `[~]` in progress · `[x]` done and verified.

---

## T-DA-00 — Project Bootstrap `[x]`

**Scope:** `package.json`, `tsconfig.json`, `eslint.config.js`, `.husky/`, `src/index.ts`, `src/__tests__/smoke.test.ts`, `.env.example`, `docker-compose.yml`, `pnpm.yaml`

**Definition of Done:**

- [x] TypeScript 5.9.3 with `module: NodeNext`, strict mode, `"types": ["node"]` explicit
- [x] ESLint v10 flat config + `typescript-eslint@8.71.0`; `no-console: warn`
- [x] Prettier 3.9.9; `format:check` clean
- [x] Husky v9 hooks: `pre-commit` (lint-staged) + `commit-msg` (commitlint Conventional Commits)
- [x] Vitest 5.0.3 smoke test passing
- [x] LangSmith client exported from `src/index.ts`; warns when `LANGCHAIN_API_KEY` unset
- [x] All deps pinned exact (no `^` or `~`); `pnpm.yaml` allows esbuild build scripts
- [x] `.env.example` documents all env vars (LangSmith, Gemini, Groq, Tavily, LLM Guard)
- [x] LLM Guard sidecar stub in `docker-compose.yml` (profile: `guardrails`, opt-in)
- [x] All CI gates pass: `typecheck`, `lint`, `format:check`, `test`, `build`

---

## T-DA-00.1 — Initial Decision Records

**Scope:** `docs/decisions/DDR-001-tech-stack.md` through `docs/decisions/DDR-005-measurement-discipline.md`

Write ADRs for architecture decisions already settled during bootstrap. These record
the _why_ — essential context for evaluating experiment results and onboarding.

| #       | Title                           | Key decision                                                                                                                                                                   |
| ------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DDR-001 | Tech stack selection            | TypeScript + pnpm v11 + NodeNext ESM; not Python/Deno                                                                                                                          |
| DDR-002 | Tracer: LangSmith over LangFuse | Auto-traces via env vars; curriculum alignment; LangFuse removed                                                                                                               |
| DDR-003 | LLM provider policy             | Gemini Flash primary (versioned for all measured runs); Groq single-call only; never Qwen3 in multi-turn tool-calling loops; applies Cost-Aware Model Selection (CAMS) pattern |
| DDR-004 | No HTTP server                  | DeepAgents is a standalone harness; fullstack uses LangGraph Server + `useStream`; Fastify removed                                                                             |
| DDR-005 | Measurement discipline          | Sequential runs; exponential backoff on 429; count model calls per run; pin exact versions; record model name + `deepagents` version in every trace                            |

**Definition of Done:**

- [ ] DDR-001 through DDR-005 created in `docs/decisions/` following `TEMPLATE.md`
- [ ] Each DDR has: context, decision, consequences, alternatives considered
- [ ] `docs/decisions/README.md` index updated with all five entries
- [ ] DDRs that interact reference each other (e.g., DDR-003 ↔ DDR-005 on version pinning)

---

## T-DA-00.2 — Skills Installation + Claude Code Hooks

**Scope:** `.claude/skills/` (installed via `npx skills add`); `.claude/settings.local.json` (PostToolUse hooks)

Install the `obra/superpowers` workflow skills that close gaps in the existing slash commands, then configure Claude Code's event-driven hooks to auto-validate on every file edit.

**Skills to install (exact commands):**

```bash
npx skills add https://github.com/obra/superpowers --skill verification-before-completion
npx skills add https://github.com/obra/superpowers --skill systematic-debugging
npx skills add https://github.com/obra/superpowers --skill subagent-driven-development
npx skills add https://github.com/obra/superpowers --skill dispatching-parallel-agents
npx skills add https://github.com/obra/superpowers --skill test-driven-development
npx skills add https://github.com/obra/superpowers --skill requesting-code-review
npx skills add https://github.com/obra/superpowers --skill using-git-worktrees
npx skills add https://github.com/obra/superpowers --skill finishing-a-development-branch
npx skills add vercel-labs/skills  # find-skills meta-skill
```

**Why each skill:**

| Skill                            | Gap it fills                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `verification-before-completion` | Enforces `pnpm typecheck && pnpm test` actually runs before any DoD item is checked — `/finish-task` says to do this but can't enforce it |
| `systematic-debugging`           | 4-phase root-cause analysis for T-DA-07 trace failures and any broken experiment scripts                                                  |
| `subagent-driven-development`    | 2-stage review (spec + quality) for sub-agent output — directly maps to T-DA-04/05                                                        |
| `dispatching-parallel-agents`    | Runs T-DA-02 baseline vs treatment concurrently with isolated contexts                                                                    |
| `test-driven-development`        | RED-GREEN-REFACTOR discipline for `backoff.ts` and `counter.ts` in T-DA-01                                                                |
| `requesting-code-review`         | Dispatches a fresh-context review sub-agent before closing any task                                                                       |
| `using-git-worktrees`            | Isolated worktrees with auto-setup (detects pnpm) — run T-DA-02 baseline vs treatment in parallel without state contamination             |
| `finishing-a-development-branch` | Test suite → 4-option merge/PR menu — standard close for each T-DA-XX task                                                                |
| `find-skills`                    | Meta-skill — agent auto-searches for relevant skills when starting new tasks                                                              |

**Claude Code hooks to add (`PostToolUse`):**

Add to `.claude/settings.local.json` under `"hooks"`:

- After every `Write`/`Edit` tool call: run `pnpm typecheck` silently; surface any errors back to the agent
- After every `Bash` call that changes files: run `pnpm lint src/` on changed `.ts` files

**Definition of Done:**

- [ ] All 9 skill installs succeed; skills visible in `.claude/skills/` or equivalent path
- [ ] `verification-before-completion` and `systematic-debugging` confirmed active (invoke `/verification-before-completion help` or similar)
- [ ] PostToolUse hook configured in `.claude/settings.local.json`; verified by editing a file with a type error and observing the hook fires
- [ ] `npx cct@latest --health-check` run; any config issues resolved

---

## T-DA-01 — Scaffold + Reality Check

**Scope:** `src/agent.ts`, `src/lib/backoff.ts`, `src/lib/counter.ts`; `deepagents@1.14.1` already installed

**Definition of Done:**

- [ ] `createDeepAgent` instantiates without error; LangSmith trace ID logged to console
- [ ] Tool-list JSON dump saved at `docs/tool-list-default.json`; `write_todos` confirmed present in default agent (built-in — no opt-in middleware required; `REQUIRED_MIDDLEWARE_NAMES = { FilesystemMiddleware, SubAgentMiddleware }`)
- [ ] 429 backoff helper unit-tested against mock 429 response
- [ ] `src/lib/counter.ts` tracks **4 dimensions** per run: token count, estimated cost (USD), wall-clock time (ms), tool-call count — all checked pre-step (Budget-Guarded Autonomy pattern)
- [ ] Pinned `deepagents` version + actual Gemini Flash model ID recorded in `docs/PROGRESS.md`; both added as trace metadata on every run

---

## T-DA-02 — Planning-First (Output 2)

**Scope:** `src/experiments/planning-first/{baseline,treatment,run}.ts`; `results/planning-first/`

**Definition of Done:**

- [ ] 10 baseline runs + 10 treatment runs completed
- [ ] Baseline: default agent with no planning instruction; first-call rate for `write_todos` honestly reported (even if 0/10)
- [ ] Treatment: system prompt explicitly instructs the agent to call `write_todos` before any other action; ≥8/10 runs: first tool call = `write_todos`
- [ ] LangSmith trace shows `write_todos` + todo status updates (pending→in_progress→completed)
- [ ] PTR token overhead measured: tokens consumed by `write_todos` recitation per step recorded (Plan & TODO Recitation pattern — cap system prompt at ≤10 todo items)
- [ ] Token counts + model-call counts per run recorded in `results/planning-first/`

---

## T-DA-03 — Artifact Agent (Output 1)

**Scope:** `corpus/` (fixed local AI-regulation files, ≤10 docs, EU AI Act + US EO on AI), `src/experiments/artifact-agent/`, `src/scripts/check-report.ts`

**Definition of Done:**

- [ ] `FilesystemBackend` (disk-persistent) used for experiments — not `StateBackend`; large corpus analysis written to `/report/` files, only file paths kept in agent messages (Filesystem as Context pattern)
- [ ] Agent produces `/report/summary.md`, `/report/findings/*.md` (≥3 files), `/report/sources.md`
- [ ] `check-report.ts` verifies file structure AND that every finding cites a corpus source (deterministic, no LLM judge)
- [ ] ≥3 successful runs with checker passing
- [ ] LangSmith trace ID recorded for each run

---

## T-DA-04 — Context Isolation Proof (Output 3)

**Scope:** `src/experiments/context-isolation/{config-a,config-b,measure}.ts`

**Definition of Done:**

- [ ] ≥3 runs each config (A: main agent retrieves directly; B: research sub-agents spawned via `task` tool — Supervisor-Worker pattern; keep sub-agent count ≤5 to avoid diminishing returns beyond that threshold)
- [ ] Isolation ratio reported: `main_agent_peak_tokens(B) / main_agent_peak_tokens(A)` ≤ 0.50 (Context Isolate Patterns — CIP)
- [ ] Quality gate: T-DA-03 checker passes for both configs
- [ ] Total system token cost reported even if B > A total (SVW pattern: sub-agent delegation costs ~15x baseline total — document the threshold where it becomes worth it)

---

## T-DA-05 — Critique Workflow

**Scope:** `src/experiments/critique/critic.ts`; `corpus/drafts/`; `corpus/feedback/`

**Definition of Done:**

- [ ] Critic tools restricted to `read_file`, `ls`, `glob`, `grep` only — zero irreversible operations (Blast-Radius Containment pattern); configured via `createFilesystemMiddleware({ tools: ["read_file", "ls", "glob", "grep"] })`
- [ ] Critic writes structured feedback (numbered items) to `/feedback/` only — format aids producer convergence
- [ ] Adversarial write attempt to `/drafts/` denied; denial logged in LangSmith trace
- [ ] Draft file hash unchanged after critic run
- [ ] ≤3 draft/critique/revision rounds (Producer-Critic pattern — cap prevents runaway cost)
- [ ] Critique Precision tracked: valid issues raised ÷ total critiques per round, recorded in LangSmith trace metadata
- [ ] Final revision addresses each feedback item (verified by diff)

---

## T-DA-06 — Harness Optimization Drills

**Scope:** `src/experiments/harness/`; `benchmark/subset/` (curated 20-problem TypeScript algorithmic subset)

**Definition of Done:**

- [ ] Curated TS subset constructed; selection criterion documented (baseline Gemini Flash fails ≥20%)
- [ ] DDR-009 written: benchmark code-execution environment decision (JS port vs curated subset vs sandbox)
- [ ] **5 harness steps** measured (≥3 runs each), in order:
  1. **Baseline** — default agent, no changes
  2. **Think Tool** — add `think` no-op tool + prompt examples; expected +54% on multi-step tasks (Structured Reflection pattern)
  3. **CETC middleware** — enable tool-result clearing via `clear_tool_uses_20250919`; measure token reduction vs baseline (expect ~84% reduction on long runs)
  4. **Pre-completion checklist** — middleware enforces checklist before final answer
  5. **Plan-Execute Decoupling (ReWOO)** — full `write_todos` DAG generated upfront, no interleaved prompting; measure model-call count reduction
- [ ] Pass rate + cost/task table for all 5 steps in `reports/`

---

## T-DA-07 — "Loses the Plot" Trace Analysis

**Scope:** `reports/trace-analysis.md`; harness patches if fix is applied

**Definition of Done:**

- [ ] ≥2 concrete failure points named by tool-call sequence (not prose description); use `systematic-debugging` skill for root-cause analysis
- [ ] Each failure point described with: span name → tool called → expected vs actual outcome (Agent Observability & Tracing pattern)
- [ ] Per-span token counts extracted from LangSmith traces; `deepagents_version` and `model_id` verified present in every span's metadata
- [ ] ≥1 fix implemented as a harness change (not a prompt instruction)
- [ ] Before/after numbers (pass rate or token cost) for the fixed failure mode

---

## T-DA-08 — Late-Phase Decision Records + Phase Report

**Scope:** `docs/decisions/DDR-006.md` through `docs/decisions/DDR-010.md`; `reports/phase-report.md`

Write the five DDRs for decisions made during experiments, then produce the final phase report.

| #       | Title                                                                 | Written during |
| ------- | --------------------------------------------------------------------- | -------------- |
| DDR-006 | Filesystem backend (FilesystemBackend vs StateBackend vs Composite)   | T-DA-03        | FSC pattern                                                         |
| DDR-007 | Planning enforcement: prompt instruction vs no instruction            | T-DA-02        | PTR + ReWOO patterns                                                |
| DDR-008 | Critique sub-agent permission design                                  | T-DA-05        | BRC + PC patterns                                                   |
| DDR-009 | Benchmark code-execution environment                                  | T-DA-06        | —                                                                   |
| DDR-010 | DeepAgents vs plain LangGraph — when delegation overhead is justified | T-DA-07        | SVW pattern (15x token baseline; >5-7 workers: diminishing returns) |

**Definition of Done:**

- [ ] DDR-006 through DDR-010 created; `docs/decisions/README.md` index complete (all 10 entries)
- [ ] Phase report covers: evidence for each required output, cost summary, lessons learned
- [ ] Phase report links to all LangSmith trace IDs

---

## T-FS-01 — Backend: DeepAgents on LangGraph Server

**Scope:** `src/agent.ts`, `langgraph.json`; deps already installed (`deepagents`, `@langchain/langgraph-api`, `@langchain/langgraph-cli`, `@langchain/langgraph-sdk`, `@langchain/langgraph-checkpoint`)

**What this layer does:** `createDeepAgent()` returns a compiled LangGraph graph. `langgraphjs dev` uses `tsx` (already in the project) to load `src/agent.ts` and serve the graph at `localhost:2024` — no custom HTTP server needed.

**Definition of Done:**

- [ ] `src/agent.ts` created: `createDeepAgent({ model, backend: new StateBackend(), systemPrompt })` exported as `graph`
- [ ] `gemini-2.0-flash` used as model (alias acceptable for demo; pinned ID for experiments)
- [ ] `StateBackend` chosen for file storage (in-memory per thread, no disk writes — Filesystem as Context pattern)
- [ ] `skills/` directory created alongside `src/agent.ts`; at least one `SKILL.md` (e.g., `skills/corpus-search/SKILL.md`) passed to `createDeepAgent({ skills: [...] })` (Agent Skills pattern)
- [ ] `langgraph.json` created: `graphs.agent = "./src/agent.ts:graph"`, `env = ".env"`, `node_version = "20"`, CORS `allow_origins = ["http://localhost:5173"]`
- [ ] `"dev:server": "langgraphjs dev"` added to root `package.json` scripts
- [ ] `langgraphjs dev` starts without error; `GET http://localhost:2024/info` returns 200
- [ ] POST to `localhost:2024/runs/stream` triggers a LangSmith trace (visible in project `deep-agents-phase`)

**Key facts (verified during research):**

- `deepagents` has zero runtime imports from `langsmith` — peer-dep mismatch (`<0.10.0` vs installed `0.10.7`) is safe to ignore
- `REQUIRED_MIDDLEWARE_NAMES = { FilesystemMiddleware, SubAgentMiddleware }` — `write_todos` is built-in by default, not opt-in middleware
- `langgraphjs dev` default loader = `tsx`; our `tsx@4.23.15` is picked up automatically

---

## T-FS-02 — Frontend: Vite + React + `useStream`

**Scope:** `apps/web/` (new pnpm workspace package); `pnpm-workspace.yaml` updated

**What this layer does:** `useStream` from `@langchain/react` connects to `localhost:2024` via SSE, manages thread lifecycle, and streams `messages`, `toolCalls`, and `isLoading` state into React.

**Pinned versions (verified):**

| Package                             | Version                               |
| ----------------------------------- | ------------------------------------- |
| `@langchain/react`                  | `1.2.0`                               |
| `@langchain/core`                   | `1.2.14` (peer dep; re-pin from root) |
| `react` + `react-dom`               | `19.3.0`                              |
| `@types/react` + `@types/react-dom` | `19.3.0`                              |
| `@vitejs/plugin-react`              | `6.1.1`                               |
| `vite`                              | `8.3.2`                               |
| `typescript`                        | `5.9.3` (shared with root)            |

**Definition of Done:**

- [ ] `pnpm-workspace.yaml` updated with `packages: - 'apps/*'`
- [ ] `apps/web/package.json` created with all deps pinned exact (no `^` or `~`)
- [ ] `apps/web/tsconfig.json`: `module: ESNext`, `moduleResolution: Bundler`, `jsx: react-jsx`, `lib: [ES2022, DOM, DOM.Iterable]`
- [ ] `apps/web/src/App.tsx`: `useStream({ apiUrl: "http://localhost:2024", assistantId: "agent" })` wired to a text input + message list
- [ ] `"dev:web": "pnpm --filter web dev"` added to root `package.json` scripts
- [ ] End-to-end smoke: user types a message in the browser → agent streams a reply → LangSmith trace shows the full run

---

## T-FS-03 — Production: Dockerfile + Deployment

**Scope:** `Dockerfile` (generated); `langgraph.json` prod CORS; deployment notes in `docs/deploy.md`

**What this layer does:** `langgraphjs dockerfile` generates a production-ready Dockerfile. For managed hosting, `langgraphjs deploy` pushes to LangSmith Deployments (beta). Self-hosting runs the same Docker image.

**Definition of Done:**

- [ ] `langgraphjs dockerfile Dockerfile` run; generated `Dockerfile` committed
- [ ] `langgraph.json` updated: prod CORS `allow_origins` set (either explicit domains or `*` with auth)
- [ ] `docker build` succeeds locally (or CI step documented if Docker not available)
- [ ] `docs/deploy.md` written covering three paths:
  1. LangSmith Deployments (managed) — `langgraphjs deploy`
  2. Self-hosted — `docker compose up` with `LANGCHAIN_API_KEY` and `GEMINI_API_KEY` as secrets
  3. Frontend — static Vite build (`VITE_API_URL=<prod-url>`) deployed to Vercel / Cloudflare Pages
- [ ] Frontend env var `VITE_API_URL` parameterised (not hardcoded `localhost:2024`)
- [ ] Auth strategy documented: LangGraph Server token header or LangSmith-managed auth
- [ ] PostgreSQL or Redis checkpointer replaces in-memory saver in the Docker image (Durable Execution pattern — enables crash recovery and human-in-the-loop pauses)
