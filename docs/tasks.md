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
- [x] LangSmith client exported from `src/index.ts`; warns when `LANGSMITH_API_KEY` unset (fallback: `LANGCHAIN_API_KEY`; env var name updated to canonical form in T-DA-02)
- [x] All deps pinned exact (no `^` or `~`); `pnpm.yaml` allows esbuild build scripts
- [x] `.env.example` documents all env vars (LangSmith, Gemini, Groq, Tavily, LLM Guard)
- [x] LLM Guard sidecar stub in `docker-compose.yml` (profile: `guardrails`, opt-in)
- [x] All CI gates pass: `typecheck`, `lint`, `format:check`, `test`, `build`

---

## T-DA-00.1 — Initial Decision Records `[x]`

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

- [x] DDR-001 through DDR-005 created in `docs/decisions/` following `TEMPLATE.md`
- [x] Each DDR has: context, decision, consequences, alternatives considered
- [x] `docs/decisions/README.md` index updated with all five entries
- [x] DDRs that interact reference each other (e.g., DDR-003 ↔ DDR-005 on version pinning)

---

## T-DA-00.2 — Skills Installation + Claude Code Hooks `[x]`

**Scope:** `.claude/skills/` (installed via `npx skills add`); `.claude/settings.local.json` (PostToolUse hooks)

Install the `obra/superpowers` workflow skills that close gaps in the existing slash commands, then configure Claude Code's event-driven hooks to auto-validate on every file edit.

**Skills to install (exact commands):**

```bash
npx skills add https://github.com/obra/superpowers --skill verification-before-completion
npx skills add https://github.com/obra/superpowers --skill systematic-debugging
npx skills add https://github.com/obra/superpowers --skill subagent-driven-development
npx skills add https://github.com/obra/superpowers --skill test-driven-development
npx skills add https://github.com/obra/superpowers --skill requesting-code-review
npx skills add https://github.com/obra/superpowers --skill finishing-a-development-branch
```

**Why each skill:**

| Skill                            | Gap it fills                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `verification-before-completion` | Enforces `pnpm typecheck && pnpm test` actually runs before any DoD item is checked — `/finish-task` says to do this but can't enforce it |
| `systematic-debugging`           | 4-phase root-cause analysis for T-DA-07 trace failures and any broken experiment scripts                                                  |
| `subagent-driven-development`    | 2-stage review (spec + quality) for sub-agent output — directly maps to T-DA-04/05                                                        |
| `test-driven-development`        | RED-GREEN-REFACTOR discipline for `backoff.ts` and `counter.ts` in T-DA-01                                                                |
| `requesting-code-review`         | Dispatches a fresh-context review sub-agent before closing any task                                                                       |
| `finishing-a-development-branch` | Test suite → 4-option merge/PR menu — standard close for each T-DA-XX task                                                                |

**Claude Code hooks to add (`PostToolUse`):**

Add to `.claude/settings.local.json` under `"hooks"`:

- After every `Write`/`Edit` tool call: run `pnpm typecheck` silently; surface any errors back to the agent
- After every `Bash` call that changes files: run `pnpm lint src/` on changed `.ts` files

**Definition of Done:**

- [x] All 6 skills installed; visible in `.claude/skills/`
- [x] `verification-before-completion` and `systematic-debugging` confirmed active
- [x] PostToolUse hooks configured in `.claude/settings.local.json` (typecheck on Edit/Write; eslint on Bash)

---

## T-DA-01 — Scaffold + Reality Check `[x]`

**Scope:** `src/agent.ts`, `src/lib/backoff.ts`, `src/lib/counter.ts`; `deepagents@1.14.1` already installed

**Definition of Done:**

- [x] `createDeepAgent` instantiates without error; LangSmith trace ID logged to console
- [x] Tool-list JSON dump saved at `docs/tool-list-default.json`; `write_todos` confirmed present (requires explicit `todoListMiddleware()` for Google model profiles — `REQUIRED_MIDDLEWARE_NAMES` is empty for `google-genai:` prefix in `deepagents@1.14.1`)
- [x] 429 backoff helper unit-tested against mock 429 response
- [x] `src/lib/counter.ts` tracks **4 dimensions** per run: token count, estimated cost (USD), wall-clock time (ms), tool-call count — all checked pre-step (Budget-Guarded Autonomy pattern)
- [x] Pinned `deepagents` version + actual Gemini Flash model ID recorded in `docs/PROGRESS.md`; both added as trace metadata on every run

---

## T-DA-02 — Planning-First (Output 2) `[x]`

**Scope:** `src/experiments/planning-first/{baseline,treatment,run}.ts`; `results/planning-first/`

**Definition of Done:**

- [x] 10 baseline runs + 10 treatment runs completed
- [x] Baseline: default agent with no planning instruction; first-call rate for `write_todos` honestly reported (even if 0/10)
- [x] Treatment: system prompt explicitly instructs the agent to call `write_todos` before any other action; ≥8/10 runs: first tool call = `write_todos`
- [x] LangSmith trace shows `write_todos` + todo status updates (pending→in_progress→completed)
- [x] PTR token overhead measured: total token delta vs baseline (+30,818/run) decomposed into extra-call share (~61%) and per-call context growth (~39%) using median 7-call mode; per-step `write_todos` recitation cost was not isolated (`toolsBeforeCall` not collected until post-T-DA-03) — cap todo lists at ≤10 items to limit context-growth component
- [x] Token counts + model-call counts per run recorded in `results/planning-first/`
- [x] **DDR-007 written** (`docs/decisions/DDR-007-planning-enforcement.md`) — decision: prompt instruction vs no instruction; include measured first-call rates as empirical evidence

---

## T-DA-03 — Artifact Agent (Output 1) `[x]`

**Scope:** `corpus/` (fixed local AI-regulation files, ≤10 docs, EU AI Act + US EO on AI), `src/experiments/artifact-agent/`, `src/scripts/check-report.ts`

**Definition of Done:**

- [x] `FilesystemBackend` (disk-persistent) used for experiments — not `StateBackend`; corpus content read on-demand via tool calls, not serialised into every subsequent step (Filesystem as Context pattern)
- [x] Agent produces `/report/summary.md`, `/report/findings/*.md` (≥3 files), `/report/sources.md`
- [x] `check-report.ts` verifies file structure AND that every finding cites a corpus source (deterministic, no LLM judge)
- [x] ≥3 successful runs with checker passing (checker_pass_rate: 3/3)
- [x] LangSmith trace ID recorded for each run (`runId` passed in invoke config from T-DA-03 onwards; initial 3 runs auto-traced under project `deep-agents-phase`, `langsmithRunId: null` in pre-fix results)
- [x] **DDR-006 written** (`docs/decisions/DDR-006-filesystem-backend.md`) — backend rationale (checkpoint growth vs disk isolation) documented; checkpoint-size comparison proposed, not run

---

## T-DA-04 — Context Isolation Proof (Output 3) `[x]`

**Scope:** `src/experiments/context-isolation/{config-a,config-b,measure}.ts`

**Definition of Done:**

- [x] ≥3 runs each config (A: main agent retrieves directly; B: research sub-agents spawned via `task` tool — Supervisor-Worker pattern; keep sub-agent count ≤5 to avoid diminishing returns beyond that threshold); **inject filesystem middleware explicitly per-run** — sub-agents do NOT inherit parent middleware (`mergeMiddlewareStack appendNew:false`; see DDR-013); actual pattern: `middleware: [workerFsMw]` (empty base array, `workerFsMw` injected at run time)
- [x] Isolation ratio reported: `main_agent_peak_tokens(B) / main_agent_peak_tokens(A)` ≤ 0.50 (Context Isolate Patterns — CIP) — **PASS — 0.3286 (median of 3, expanded corpus ~38.5KB / 8 files); v1 deviation 0.5464 preserved in report**
- [x] Quality gate: T-DA-03 checker passes for both configs (3/3 A, 3/3 B)
- [x] Total system token cost reported even if B > A total — A: $0.1922, B: $0.1849 total; B is cost-neutral at this corpus size (DDR-010)
- [x] Per-run time breakdown reported: `elapsedMs`, `retryWaitMs`, `workMs` — all runs: retryWaitMs=0; B workMs 24–28s vs A 17–22s

**All DoD bullets met.** Gate passed on v2 run (expanded corpus). See `reports/T-DA-04-report.md`.

---

## T-DA-05 — Critique Workflow `[~]`

**Scope:** `src/experiments/critique/critic.ts`; `corpus/drafts/`; `corpus/feedback/`

**Definition of Done:**

- [x] Critic tools: `["read_file", "ls", "glob", "write_file"]` — `grep` excluded (not needed for read-only critique; omitting it reduces blast radius); **`execute` excluded via explicit `tools` allowlist** (do NOT rely on backend capability filtering — `execute` appears in `tool-list-default.json` because the default stack registers it at init time and filters only at request time; explicitly omit it); write restricted to `/feedback/` via `permissions` rules (BRC pattern); `createFilesystemMiddleware({ tools: ["read_file", "ls", "glob", "write_file"], permissions: [{ operations: ["write"], paths: ["/feedback/**"], mode: "allow" }, { operations: ["write"], paths: ["/**"], mode: "deny" }] })` — **Note: `FilesystemOperation = "read" | "write"` only in deepagents@1.14.1 — no `"delete"` operation type exists; write-only BRC is correctly expressed as `["write"]` only** — **Permission rule order:** rules are evaluated first-match-wins; the allow rule for `/feedback/**` must come first so writes there succeed; the final `deny` for `/**` is required because the default is allow — without it, any path not matching the allow rule would be permitted by default (BRC pattern requires explicit deny to close the gap)
- [x] Critic writes structured feedback (numbered items) to `/feedback/` only — format aids producer convergence
- [x] Adversarial write attempts denied: (1) write to `/drafts/` hits `deny` rule; (2) write to `/report/` hits `deny` rule — v1 `/drafts/` 3 runs: **verified from LangSmith trace** (AIMessage tool_calls=[{name:write_file, args:{file_path:/drafts/adversarial.md}}] + ToolMessage status=error; runs 2616cf1c, 35c1eb98, e5625c35); v1 `/report/` 3 runs: model-level refusal (write_file not called — not enforcement evidence); v2 both paths: **verified from supervisor-results.json** (writeAttempted=true, permissionDeniedInTrace=true; runs 70b0348b, 2b345a88); disk check confirmed no file created for any verified enforcement run
- [x] Draft file hash unchanged after critic run (verified all 3 rounds: 2270c5af, 9750d6a1, bdf9f8f5)
- [x] ≤3 draft/critique/revision rounds (Producer-Critic pattern — cap prevents runaway cost)
- [x] Critique Precision tracked: valid issues raised ÷ total critiques per round, recorded in `results/critique/results.json` (not in LangSmith trace metadata — `runMetadata` is set before the judge runs so precision is only available post-run) (round 1: 10/10=1.0; round 2: 12/12=1.0; round 3: 17/17=1.0) — **judge not calibrated**: calibration test FAILED 2/3 (spurious item 11 not caught); precision figures are provisional pending re-run with unambiguous false controls
- [ ] Final revision addresses each feedback item — **NOT MET**: producer fixed 1/5 seeded flaws (F5 only) across 3 rounds; F1–F4 persisted and were re-flagged each round; revision notes self-reported "addressed" but F1–F4 reappeared unchanged in subsequent rounds; revised-draft-only inspection would be needed to confirm actual text changes. feedbackRead corrected: supervisor issues explicit read_file on /feedback/round-N.md (detection bug: code checked args['path']; deepagents uses args['file_path']); task ToolMessage carries only "Task completed"
- [x] **DDR-008 written** (`docs/decisions/DDR-008-critic-permissions.md`) — decision: critic tool allowlist; adversarial denial evidence table with 6 LangSmith run IDs
- [x] `delete` blocked by `write` deny rule — `deepagents@1.14.1` routes `delete` through write permission checker; `deny ['write']` on `/**` blocks deletions; confirmed: `deleteAttempted=true`, `wasDeleted=false`, `fileExistsAfter=true`; tool error: `"Error: permission denied for write on /drafts/delete-target.md (matches deny rule(s): /**)"` (LangSmith run `bba95992-946d-4452-8be1-3cf362603fd6`)
- [x] BGA stops before tool execution — `maxToolCalls: 0` budget: agent's first tool call intercepted by `wrapModelCall`; `budgetError: "Budget exceeded: tool calls 1 > 0"`; `fileExistsAfter=false`; `streamPreventedExecution=true`

**Deviation resolved:** The critic is now implemented as a real `task`-tool sub-agent with the supervisor as the producer agent. Hash-guard middleware on the supervisor enforces the `/drafts/` immutability invariant and caps critic rounds at 3. See **DDR-015** (`docs/decisions/DDR-015-pc-loop-task-sub-agent.md`) for the design. The original direct-orchestration `run.ts` is retained alongside `supervisor-run.ts`; both are valid patterns for different trade-offs. `supervisor-results.json` records the measurements from the task-tool approach.

---

## T-DA-06 — Harness Optimization Drills

**Scope:** `src/experiments/harness/`; `benchmark/subset/` (curated 20-problem TypeScript algorithmic subset)

**Definition of Done:**

- [ ] Curated TS subset constructed; selection criterion documented (baseline Gemini Flash fails ≥20%)
- [ ] DDR-009 written: benchmark code-execution environment decision (JS port vs curated subset vs sandbox)
- [ ] **5 harness steps** measured (≥3 runs each), in order:
  1. **Baseline** — default agent, no changes
  2. **Think Tool** — add `think` no-op tool + prompt examples; measure pass rate delta (Structured Reflection pattern; +54% is Anthropic's published result on their model — treat as hypothesis, report actual delta)
  3. **Context Pruning middleware** — implement `wrapModelCall` middleware that removes tool-result messages older than the last N steps before each model call; measure token reduction vs baseline (`clear_tool_uses_20250919` is Anthropic-API-only and unavailable with `google-genai:`; ~84% reduction is Anthropic's figure — measure actual delta)
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
- [ ] **DDR-014 written** (`docs/decisions/DDR-014-deepagents-vs-langgraph.md`) — decision: when DeepAgents overhead is justified vs plain LangGraph; use measured token costs as empirical evidence

---

## T-DA-08 — DDR Index Finalization + Phase Report

**Scope:** `docs/decisions/README.md`; `reports/phase-report.md`

DDRs are written inline during their respective experiment tasks (see DoD items in T-DA-02, T-DA-03, T-DA-05, T-DA-06, T-DA-07). This task verifies they all landed, completes the index, and produces the final phase report.

| #       | Title                                                                       | Written in  | Pattern reference                                                   |
| ------- | --------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| DDR-006 | Filesystem backend (FilesystemBackend vs StateBackend vs Composite)         | T-DA-03     | FSC pattern                                                         |
| DDR-007 | Planning enforcement: prompt instruction vs no instruction                  | T-DA-02     | PTR + ReWOO patterns                                                |
| DDR-008 | Critique sub-agent permission design                                        | T-DA-05     | BRC + PC patterns                                                   |
| DDR-009 | Benchmark code-execution environment                                        | T-DA-06     | —                                                                   |
| DDR-010 | CIP isolation benefit scales with retrieval payload vs overhead (Confirmed) | T-DA-04     | CIP pattern — gate crossing; confirmed at ~38.5KB corpus            |
| DDR-011 | Gemini tool schema filtering via wrapModelCall middleware (Superseded)      | pre-T-DA-04 | —                                                                   |
| DDR-014 | DeepAgents vs plain LangGraph — when delegation overhead is justified       | T-DA-07     | SVW pattern (15x token baseline; >5-7 workers: diminishing returns) |

**Definition of Done:**

- [ ] Verify every DDR in `docs/decisions/` exists on disk; any listed DDR missing from disk blocks this task
- [ ] `docs/decisions/README.md` index complete — one entry per DDR file in `docs/decisions/`
- [ ] Phase report covers: evidence for each required output, cost summary, lessons learned
- [ ] Phase report links to all LangSmith trace IDs

---

## T-FS-01 — Backend: DeepAgents on LangGraph Server

**Scope:** `src/agent.ts`, `langgraph.json`; deps already installed (`deepagents`, `@langchain/langgraph-api`, `@langchain/langgraph-cli`, `@langchain/langgraph-sdk`, `@langchain/langgraph-checkpoint`)

**What this layer does:** `createDeepAgent()` returns a compiled LangGraph graph. `langgraphjs dev` uses `tsx` (already in the project) to load `src/agent.ts` and serve the graph at `localhost:2024` — no custom HTTP server needed.

**Definition of Done:**

- [ ] `src/agent.ts` created: `createDeepAgent({ model, backend: new StateBackend(), systemPrompt })` exported as `graph`
- [ ] `gpt-5.4-mini-2026-03-17` used as model (matches measured experiments — DDR-012; pinned snapshot required for reproducibility)
- [ ] `StateBackend` chosen for file storage (in-memory per thread, no disk writes — Filesystem as Context pattern)
- [ ] `skills/` directory created alongside `src/agent.ts`; at least one `SKILL.md` (e.g., `skills/corpus-search/SKILL.md`) passed to `createDeepAgent({ skills: [...] })` (Agent Skills pattern)
- [ ] `langgraph.json` created: `graphs.agent = "./src/agent.ts:graph"`, `env = ".env"`, `node_version = "20"`, CORS `allow_origins = ["http://localhost:5173"]`
- [ ] `"dev:server": "langgraphjs dev"` added to root `package.json` scripts
- [ ] `langgraphjs dev` starts without error; `GET http://localhost:2024/info` returns 200
- [ ] POST to `localhost:2024/runs/stream` triggers a LangSmith trace (visible in project `deep-agents-phase`)

**Key facts (verified during research):**

- `deepagents` has zero runtime imports from `langsmith` — peer-dep mismatch (`<0.10.0` vs installed `0.10.7`) is safe to ignore
- `REQUIRED_MIDDLEWARE_NAMES` is **empty** for `google-genai:` model profiles — `write_todos` is NOT built-in; add `todoListMiddleware()` explicitly (verified T-DA-01; contradicts earlier research note)
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
