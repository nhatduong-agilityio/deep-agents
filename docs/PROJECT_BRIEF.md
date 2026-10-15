# deep-agents-phase — Project brief

Sources: `README.md`, `CLAUDE.md`, `docs/tasks.md`, `docs/PROGRESS.md`, `../docs/day-04-tickets.md` (GitLab nhat.duong/generative-ai#8, #9); spot-checked `docs/security.md`, `docs/deploy.md`, `apps/api/src/auth.ts` · Updated: 2026-10-15

## Goals

A TypeScript curriculum project that demonstrates agentic AI patterns with the `deepagents` harness on LangGraph, measured and traced with LangSmith [README]. Success is defined as three required evidence outputs by 2026-10-16: a Planning Trace (T-DA-02), an Artifact Report (T-DA-03) and a Context Isolation Proof (T-DA-04, isolation ratio ≤ 0.50). All three are reported done; peak ratio 0.3286 [README, tasks.md]. A fullstack track (T-FS-*) serves the agent through LangGraph Server with a React chat UI. Its use case is a policy analyst who asks about AI regulation and gets a cited multi-file report [tasks.md T-FS-00].

## Users and roles

| Role                      | What they need to do                                                                                                        | Permissions                                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Policy analyst (end user) | Ask AI-regulation questions in the chat UI; read and download the generated `/report/**` files [tasks.md T-FS-00, T-FS-02b] | Calls the API with a bearer token (`AUTH_TOKEN`) that the Vite proxy injects in dev [README]. The agent may read `/corpus/**` and `/skills/**` and write only `/report/**` and `/notes/**` [tasks.md T-FS-00] |
| Developer / learner       | Run experiments, record evidence, write DDRs and reports through `/start-task` and `/finish-task` [CLAUDE.md]               | Full repo access; holds the API keys in the local `.env`                                                                                                                                                      |
| Operator                  | Deploy, rotate keys, roll back, run health checks [tasks.md T-FS-04 runbook]                                                | Holds the production secrets; sets CORS origins and the OpenAI monthly spend limit                                                                                                                            |
| Reviewer / mentor         | Review evidence and reports (assumption, based on the "Mentor review" entry in PROGRESS.md)                                 | Read-only (assumption)                                                                                                                                                                                        |

## Scope

- **In scope:** the experiments T-DA-00 to T-DA-08, all marked done; LangGraph Server backend with custom auth and a per-thread cost budget (T-FS-01); React + `useStream` chat UI with agent features (todos, files panel, sub-agent activity, interrupts, reconnect) (T-FS-02, T-FS-02b); Dockerfile and deployment docs (T-FS-03); adversarial E2E tests and runbook (T-FS-04); two follow-up UI bugs, #8 and #9 [day-04-tickets.md].
- **Out of scope:** the `task`, `execute`, `delete` and `edit_file` tools in the served agent v1 [tasks.md T-FS-00/T-FS-01]; any custom HTTP server such as Fastify (DDR-004); Qwen3 on Groq in multi-turn loops [CLAUDE.md]; real-user PII [tasks.md trace data policy].

## Modules / domains

| Module           | Description                                                                                                                        | Code folder (expected)                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Agent API        | `createDeepAgent` graph for LangGraph Server, with `ThreadBudgetMiddleware` and a composite backend                                | `apps/api/src/agent.ts`                                     |
| Auth             | Custom LangGraph auth handler (DDR-016). It checks a bearer `AUTH_TOKEN`, is open in dev when unset and fails closed in production | `apps/api/src/auth.ts`                                      |
| Web chat UI      | `useStream` chat, markdown rendering of AI output, todos, files panel, errors, thread ID                                           | `apps/web/src/` (`App.tsx`, `theme.css`)                    |
| Core utilities   | 429 backoff, 4-dimension run counter, filesystem middleware, LangSmith client, sub-agent specs, tool-arg helper                    | `packages/core/src/`                                        |
| Experiments      | Planning-first, artifact agent, context isolation, critique, harness drills, trace analysis                                        | `experiments/`                                              |
| Scripts / checks | Report checker, tool-list dump, server and permission smoke tests                                                                  | `scripts/`                                                  |
| Content          | AI-regulation corpus (EU AI Act, US EO), `policy-report` skill, 20-problem TS benchmark                                            | `corpus/`, `skills/policy-report/`, `benchmark/`            |
| Evidence         | JSON run logs, task reports, DDRs, diagrams                                                                                        | `results/`, `reports/`, `docs/decisions/`, `docs/diagrams/` |

## External integrations

| System                                                      | Purpose                                                                                             | Protocol / auth                                  | Status (ready / pending)                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| OpenAI (`gpt-5.4-mini-2026-03-17`)                          | Primary model for all measured runs                                                                 | HTTPS API, `OPENAI_API_KEY` (server-side only)   | ready                                                                                 |
| Groq (`openai/gpt-oss-20b`)                                 | Single-call roles only (LLM judge, summarization)                                                   | HTTPS API, API key                               | ready                                                                                 |
| LangSmith                                                   | Tracing (`LANGSMITH_TRACING=true`) and an optional managed deployment target (`langgraphjs deploy`) | HTTPS API, `LANGSMITH_API_KEY`                   | ready                                                                                 |
| LangGraph Server (`@langchain/langgraph-api`)               | Serves the graph; SSE streaming to the UI                                                           | HTTP + SSE on `:2024`, bearer token              | ready                                                                                 |
| PostgreSQL + Redis                                          | Persistence for the Docker/self-hosted API                                                          | `docker compose`                                 | ready (Docker path)                                                                   |
| LLM Guard sidecar                                           | Optional guardrails                                                                                 | `docker compose --profile guardrails`, port 8000 | pending. It is a stub [tasks.md T-DA-00] and is not wired into the agent (assumption) |
| Identity provider (per-user JWT)                            | Short-lived per-user tokens, as DDR-016 Option A describes                                          | TODO                                             | pending. The code uses a single shared `AUTH_TOKEN`                                   |
| Hosting for the static frontend (Vercel / Cloudflare Pages) | Production frontend                                                                                 | Static build with `VITE_API_URL`                 | TODO. Documented in `docs/deploy.md`, not confirmed as deployed                       |
| GitLab                                                      | Issue tracking (#8, #9)                                                                             | —                                                | ready                                                                                 |

## Non-functional requirements

- Performance: the Playwright e2e expects a non-empty assistant reply within 30 s [tasks.md T-FS-02]. Experiment runs are sequential, with exponential backoff on HTTP 429 and model calls counted per run [CLAUDE.md]. The per-thread cost cap is `THREAD_BUDGET_USD`, default 0.10 USD; when it is exceeded the server returns the error code `THREAD_BUDGET_EXCEEDED` [tasks.md T-FS-00]. There are no latency or throughput SLAs: TODO.
- Security & sensitive data: the filesystem path policy is first-match-wins with a final deny on `/**`. Secrets are server-side only, and no API key may appear in a `VITE_*` var or in the JS bundle. CORS must list explicit origins; `*` is not allowed in production. AI output is rendered through a sanitiser. Traces hold full message history, so production needs restricted visibility or tracing turned off for sensitive threads. `recursionLimit` is controlled by the client and is not a security boundary [tasks.md T-FS-00 to T-FS-04].
- Accessibility, i18n: not specified in any source. TODO.
- Supported browsers / devices: only desktop Chrome (headless, via Playwright) is evidenced [day-04-tickets.md]. Other browsers and mobile: TODO.

## Technical constraints

- Stack (all deps pinned exact, no `^`/`~`): Node 24, pnpm 11, TypeScript 5.9.3 with ESM `NodeNext`; `deepagents` 1.14.1, `@langchain/langgraph` 1.4.18, `@langchain/openai` 1.6.2, `@langchain/groq` 1.3.1, `langsmith` 0.10.7, `@langchain/langgraph-api` 1.5.1, `@langchain/react` 1.2.0, Vite 8.3.2; Vitest, React Testing Library, Playwright [README, CLAUDE.md, tasks.md].
- Primary model pinned to `openai:gpt-5.4-mini-2026-03-17` at 0.75/4.50 USD per 1M input/output tokens. Groq is for single-call roles only.
- Custom middleware is not inherited by sub-agents and must be injected explicitly. The graph must not set its own checkpointer.
- Code conventions: named exports only; `process.env['KEY']` bracket access; one-line WHY comments; validation only at boundaries [CLAUDE.md].
- Infrastructure: local Node (`pnpm dev:server` + `pnpm dev:web`) or Docker (API + Postgres + Redis) with Vite in front. Deploy targets are LangSmith Deployments or self-hosted [README, tasks.md T-FS-03].
- Deadline: 2026-10-16 [README]. Team: a single developer (assumption).

## Risks

| Risk                                                                                                                                                                                                                        | Impact                                                                                | Mitigation                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| The auth implementation does not match the decision: DDR-016 / security.md describe per-user short-lived JWTs, while `auth.ts` checks one shared `AUTH_TOKEN`, and `docs/deploy.md` shows a `VITE_AUTH_TOKEN` bundle option | A shared token cannot scope threads per user. A `VITE_` token is public in the bundle | Confirm the target auth model (open question). Update DDR-016 or implement per-user tokens before any real-user deployment |
| Status conflict: README marks T-FS-04 `[ ]`; tasks.md and PROGRESS.md mark it `[x]`                                                                                                                                         | Evidence for the deadline may look incomplete to reviewers                            | Reconcile the README with `reports/T-FS-04-report.md` (backlog E2-01)                                                      |
| Some evidence is provisional or deviated: the T-DA-05 judge is uncalibrated (2/3); the T-DA-06 benchmark gate was not met; the T-DA-07 fix-run gate FAILED                                                                  | Conclusions drawn from those numbers are weak                                         | Keep the deviations documented; follow-up runs are in backlog epic E3                                                      |
| The T-FS-02b e2e (todo completes and a file appears) was deferred                                                                                                                                                           | UI regressions in agent features are not caught end-to-end                            | Backlog E2-02                                                                                                              |
| UI fixes #8/#9 touch shared CSS (`.msg-bubble`, `.input-text`)                                                                                                                                                              | Visual regressions elsewhere (for example, AI markdown bubbles)                       | Scope CSS to `.msg-bubble--human`; add component tests                                                                     |
| Ticket line references may have drifted (ticket cites `theme.css:699` for `min-height: 38px`; the current file has it at lines 630 and 711)                                                                                 | Slower fixes, wrong edits                                                             | Re-locate the code by selector, not by line number                                                                         |

## Open questions for the BA / client

- [ ] #9: What is the maximum height of the message input before it scrolls? — proposed answer: 6 lines, then scroll.
- [ ] #9: Should the drag-to-resize corner (`resize: both`) stay? — proposed answer: remove it (`resize: none`), because auto-grow replaces it.
- [ ] #9: Should the input shrink back to one row after sending? — proposed answer: yes (this is already in the ticket DoD).
- [ ] #8: Are AI (Markdown-rendered) messages also affected by lost line breaks? — proposed answer: check during E1-03; fix only human bubbles in #8.
- [ ] #8: Keep or collapse runs of blank lines in human messages? — proposed answer: keep them as typed (`pre-wrap`).
- [ ] Which Chrome version was used for the #8/#9 measurements, and which browsers and devices must be supported? — proposed answer: latest desktop Chrome, Firefox and Safari; mobile out of scope.
- [ ] Target auth model: a shared `AUTH_TOKEN` (as implemented) or per-user JWTs from an identity provider (DDR-016 / security.md)? — proposed answer: keep the shared token for the curriculum and record it as a DDR-016 deviation; per-user JWT only if real users are planned.
- [ ] Is T-FS-04 done (tasks.md, PROGRESS.md) or open (README)? — proposed answer: done; update the README.
- [ ] Is any work planned after the 2026-10-16 deadline (epic E3 follow-ups, sub-agents v2, production hardening)? — proposed answer: only #8, #9 and doc reconciliation before the deadline; everything else after it, if at all.
- [ ] Are there any accessibility or i18n requirements? — proposed answer: English only; keyboard-operable chat input and visible focus as the minimum.
- [ ] Is the LLM Guard sidecar meant to be wired into the agent, or is it only an opt-in stub? — proposed answer: it stays a stub.

## Assumptions

- The project phase is closed except for #8, #9 and the items in BACKLOG.md; no new features are expected before the deadline (assumption).
- Single developer, no separate QA (assumption).
- Fix direction for #8: `white-space: pre-wrap` on `.msg-bubble--human` only. The ticket calls this untested (assumption until verified).
- Reviewers or mentors only read the evidence (assumption).
