# Security Baseline — T-FS-00

Applies to: T-FS-01 through T-FS-04 and any production deployment of the policy-analyst agent.

---

## Concrete Use Case

A policy analyst submits a question about AI regulation (e.g., "Which EU AI Act articles apply to
high-risk systems?"). The agent reads files from the bundled `/corpus/` directory (EU AI Act
excerpts, US EO 14110 excerpts), produces a structured multi-file report, and streams the response
back to the browser via LangGraph Server SSE.

**Expected outputs** (per T-DA-03 structure):

| File                    | Description                                   |
| ----------------------- | --------------------------------------------- |
| `/report/summary.md`    | ~500-word synthesis, high-level answer        |
| `/report/findings/*.md` | ≥3 themed findings, each citing a corpus file |
| `/report/sources.md`    | Corpus file paths + excerpt references        |

---

## Path Policy

| Path            | Allowed operations   | Notes                                                        |
| --------------- | -------------------- | ------------------------------------------------------------ |
| `/corpus/**`    | read                 | Fixed AI-regulation docs; agent must not modify them         |
| `/skills/**`    | read                 | Skill definition files (`SKILL.md`); must not be overwritten |
| `/report/**`    | read, write          | Agent working output                                         |
| `/notes/**`     | read, write          | Agent scratchpad                                             |
| Everything else | read only (no write) | Default deny-write; `deny write /**` is the catch-all        |

Enforced by `FilesystemPermission` rules in `createDeepAgent({ permissions })` (T-FS-01).
Write-deny blocks `write_file`, `edit_file`, and `delete` (confirmed T-DA-05 run bba95992).

**Tools in scope for v1:** `read_file`, `ls`, `glob`, `grep`, `write_file`, `write_todos`.
`task` (sub-agent delegation), `execute`, `delete`, and `edit_file` are excluded from the tool schema.

---

## Threat Model

### Threat 1 — Prompt Injection

**Description:** A crafted user message instructs the agent to overwrite files outside the
allowed write paths — e.g., `write_file("/skills/policy-report/SKILL.md", <malicious content>)`
or `write_file("/agent.ts", ...)`.

**Mitigation:** Filesystem permissions block all writes outside `/report/**` and `/notes/**` at
the middleware layer, regardless of what the model emits. The permission check fires before the
tool executes; the model never receives a success result for a denied write.

**Evidence gate (T-FS-04 Test 1):** An adversarial prompt targeting `/skills/**` must produce a
`permission-denied` tool result in the LangSmith trace, and the target file must remain unchanged
on disk. Both the write attempt AND the denial must appear in the trace (model refusal without an
attempt is inconclusive).

### Threat 2 — Cost Abuse

**Description:** A stuck loop, a jailbreak prompt, or a malicious user exhausts the OpenAI quota
by running unlimited model calls in a single thread.

**Mitigation:** `ThreadBudgetMiddleware` (T-FS-01) maintains a cumulative per-thread cost counter
in LangGraph thread state. Before each model call (`beforeModel` hook) it checks the total against
`THREAD_BUDGET_USD`. If exceeded it throws a structured error with `code: 'THREAD_BUDGET_EXCEEDED'`.
The counter accumulates both input and output tokens:

```
cost_per_call = inputTokens × $0.00000075 + outputTokens × $0.0000045
```

Default budget: `THREAD_BUDGET_USD=0.10` (≈ 133K input tokens or ≈ 22K output tokens at DDR-012
rates). The budget is stored in thread state, so it survives SSE reconnects. A monthly hard limit
set in the OpenAI project dashboard provides a second line of defence.

**User-facing error:** `THREAD_BUDGET_EXCEEDED` — frontend shows "This conversation has reached
its cost limit — please start a new thread." (T-FS-02 matches on `code`, not message text.)

### Threat 3 — Data Exposure via Public Env Vars

**Description:** `VITE_*` env vars are baked into the Vite JS bundle at build time and are
visible to any browser user (readable via DevTools). Any secret placed in a `VITE_*` var is
effectively public.

**Mitigation:** `OPENAI_API_KEY`, `LANGSMITH_API_KEY`, `THREAD_BUDGET_USD`, and all other secrets
are server-side only. The browser communicates with LangGraph Server via the API URL configured
as `import.meta.env['VITE_API_URL'] ?? 'http://localhost:2024'` — this is not a secret. In
production all secrets stay on the server; the browser never holds an API key.

**Audit result:** `.env.example` contains no `VITE_*` vars. The only `VITE_*` var in the project
is `VITE_API_URL` (set in `apps/web/.env.example`) which holds the server URL, not a secret.

---

## Per-Thread Cost Budget

Formula (DDR-012 pricing):

```
cost_usd = inputTokens × 0.00000075 + outputTokens × 0.0000045
```

Output tokens cost 6× input tokens, so both must be tracked. The `afterModel` hook reads
`usage_metadata.input_tokens` and `usage_metadata.output_tokens` from the last `AIMessage` and
accumulates into `threadCostUsd` in state.

| Parameter            | Default | Where set            |
| -------------------- | ------- | -------------------- |
| `THREAD_BUDGET_USD`  | `0.10`  | `.env` / server env  |
| T-FS-04 Test 2 value | `0.002` | Test `.env` override |

`recursionLimit` is a per-request client option and is not a server-side guard. Thread cost
budget (server-controlled state) is the real enforcement boundary.

---

## Auth Strategy

**Decision: Option A — LangGraph Server custom auth handler.** See DDR-016.

Production request path:

```
browser → LangGraph Server (custom auth handler validates JWT) → OpenAI
```

The auth handler is registered through the `auth.path` field in `langgraph.json` (T-FS-03), so it is active in
local development too: with `AUTH_TOKEN` set, requests to `localhost:2024` without the bearer token get 401
(observed 2026-10-19). With `AUTH_TOKEN` unset, `apps/api/src/auth.ts` allows all requests in dev and fails
closed (500) when `NODE_ENV=production`.

---

## Trace Data Policy

LangSmith traces contain the full agent message history, including user prompts and agent
responses. For this curriculum project there is no real user PII — tracing is on in all
environments (`LANGSMITH_TRACING=true`).

For a real-user production deployment:

- Restrict LangSmith project visibility to team members only.
- Consider disabling tracing for threads containing sensitive regulated data.
- Review retention settings in the LangSmith project.
