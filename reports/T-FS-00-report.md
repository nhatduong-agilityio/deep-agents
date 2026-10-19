# Report: T-FS-00 — Security Baseline: Use Case, Threat Model, and Auth Decision

**Date completed:** 2026-10-08

## What was done

- Created `docs/security.md` covering: concrete use case (policy analyst → multi-file AI
  regulation report), path policy table (read/write rules per path prefix), threat model
  (3 risks: prompt injection, cost abuse, data exposure), per-thread cost budget formula
  and defaults, auth strategy reference, and trace data policy.
- Created `docs/decisions/DDR-016-auth-strategy.md` comparing Option A (LangGraph Server
  custom auth via `~handlerCache`) and Option B (BFF/reverse proxy), resolving the open
  VERIFY item, and recording the decision as Option A.
- Updated `.env.example`: added `OPENAI_API_KEY` (primary since T-DA-04/DDR-012, missing from
  example file) and `THREAD_BUDGET_USD=0.10` with comments; annotated Gemini key as
  pre-T-DA-04.
- Updated `docs/decisions/README.md`: added DDR-016 row.
- Updated `docs/PROGRESS.md`: added Auth Decision section (VERIFY resolution, T-FS-01
  implementation notes, citation requirement); updated resume point to T-FS-01.

## Concepts covered

- **Threat model:** A structured enumeration of what can go wrong (prompt injection, cost
  abuse, data exposure) paired with the specific mitigation layer for each. The goal is to
  make every T-FS task's security requirement traceable to a named threat, not just "add
  permissions."

- **FilesystemPermission deny-write semantics:** Permissions in `createDeepAgent({ permissions })`
  use first-match-wins logic. The 5-rule set (allow write /report/**, allow write /notes/**,
  deny write /skills/**, deny write /corpus/**, deny write /**) means the catch-all deny is
  the default; explicit allows carve out exceptions. Confirmed via T-DA-05 run bba95992 that
  deny-write also blocks `delete`.

- **`~handlerCache` duck-typed protocol:** `registerAuth` in `@langchain/langgraph-api@1.5.1`
  does NOT export an `Auth` class. It checks `"~handlerCache" in module` on whatever the user
  exports. The implementer creates a plain object with `~handlerCache.authenticate(request)`.
  This is a structural protocol, not a class hierarchy.

- _\*VITE_* public surface:_* `VITE_*` vars are bundled into the Vite client JS at build time.
  Any secret placed in a `VITE_*` var is readable by any browser user via DevTools. Only
  `VITE_API_URL` (a non-secret URL) is acceptable; API keys must be server-only.

- **Thread cost budget vs recursionLimit:** `recursionLimit` is a per-invocation option that
  the client can pass or omit — it is not a server-side enforcement boundary. Thread cost
  budget (`THREAD_BUDGET_USD` in thread state, checked by `ThreadBudgetMiddleware`) is
  server-controlled and survives SSE reconnects.

## Decisions and reasons

**Option A (LangGraph custom auth) over Option B (BFF proxy):** The VERIFY item was the
blocker — if the `Auth` class didn't exist in the installed package we would have defaulted
to Option B. Reading `dist/auth/index.mjs` resolved it: no class needed, just an object
satisfying `~handlerCache`. With that resolved, Option A keeps the auth handler in the same
repo and Docker image with no extra server. See DDR-016 for full rationale.

**`OPENAI_API_KEY` added to `.env.example`:** The switch to OpenAI happened in T-DA-04
(DDR-012) but `.env.example` was never updated. T-FS-00 is the right moment to fix this
since T-FS-01 requires the key server-side and the security baseline explicitly forbids it
from appearing in any `VITE_*` var.

## Evidence of completion

```
$ ls docs/security.md docs/decisions/DDR-016-auth-strategy.md
docs/security.md
docs/decisions/DDR-016-auth-strategy.md

$ grep "^VITE_" .env.example
(no output — VITE_* audit CLEAN)

$ grep "OPENAI_API_KEY\|THREAD_BUDGET" .env.example
OPENAI_API_KEY=sk-...
THREAD_BUDGET_USD=0.10

$ grep "DDR-016" docs/decisions/README.md
| DDR-016 | Auth Strategy for LangGraph Server — Option A custom handler | Accepted | 2026-10-08 | T-FS-00 |

$ grep "DDR-016" docs/PROGRESS.md
**Settled in DDR-016:** Option A — LangGraph Server custom auth handler.
**T-FS-01 through T-FS-04 must cite DDR-016 for the auth approach.**
```

No LangSmith trace — this task produces documentation only.

## Gotchas / lessons learned

**There is no `Auth` class in `@langchain/langgraph-api@1.5.1`.** The task spec said to
check for it and default to Option B if it couldn't be found. Reading the source revealed
the protocol is duck-typed (`~handlerCache` in-check), not class-based. Anyone implementing
T-FS-01 auth who goes looking for an `Auth` import will find nothing — the export to use is
a plain object literal with that property.

**`disable_studio_auth: true` is required for local LangGraph Studio dev.** `custom.mjs`
line 19 checks `c.req.header("x-auth-scheme") === "langsmith"` — if `disable_studio_auth`
is `false` (default) the Studio request goes through `authenticate()` which will reject it
unless the Studio sends a valid JWT. Set `true` in `langgraph.json` for the dev workflow.
