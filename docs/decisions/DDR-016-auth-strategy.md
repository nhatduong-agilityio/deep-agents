# DDR-016: Auth Strategy for LangGraph Server (T-FS-00)

**Date:** 2026-10-08
**Status:** Accepted

## Context

T-FS-01 deploys the policy-analyst agent behind LangGraph Server (`localhost:2024` for dev,
a Docker container for production). Without an auth layer any user who can reach the server
endpoint can issue unlimited requests, run up the OpenAI bill, and read all thread histories.

Two options were on the table. The task spec noted that Option A had an open VERIFY item:
the `Auth` class was described but its constructor was not in the installed dist. That VERIFY
was resolved by reading `@langchain/langgraph-api@1.5.1 dist/auth/index.mjs` before starting
the implementation.

**VERIFY resolution:** `registerAuth` (exported from `@langchain/langgraph-api`) loads the
module at `auth.path` and performs a duck-type check: `"~handlerCache" in module`. There is no
`Auth` class to import. The implementer creates an exported object with the following shape:

```ts
export const auth = {
  '~handlerCache': {
    authenticate: async (request: Request): Promise<string | AuthUser> => {
      // validate JWT from Authorization header
      // return string (identity) or { identity, permissions, is_authenticated, display_name }
      // throw { status: 401, headers: {}, message: '...' } to reject
    },
    callbacks: {}, // optional: resource:action handlers for fine-grained authz
  },
};
```

`langgraph.json` references it via `auth.path: './src/auth.ts:auth'` (file:export format
confirmed in `registerAuth` source: splits on `:` to get `[userFile, exportSymbol]`).

## Options Considered

### Option A — LangGraph Server custom auth handler

The server loads a user-supplied module whose default or named export satisfies the
`~handlerCache` protocol. On every incoming request the `authenticate` function is called;
the result is attached to the Hono context as `auth.user`. Optional `callbacks` entries
allow per-resource authorization.

- Pros:
  - Single deployment unit — no extra server
  - Auth lives next to the agent code; same repo, same deploy
  - VERIFY resolved — fully implementable with installed packages
  - Token scoping and user identity available to the graph via context
- Cons:
  - Token issuance is out of scope — requires an external IdP or a test-token helper
  - `disable_studio_auth` has a TODO comment in the source (line 110); LangGraph Studio
    integration may need `auth.disable_studio_auth: true` in `langgraph.json` for local dev

### Option B — BFF / reverse proxy

A thin server (e.g., Express or Hono) validates the user session, holds all secrets, applies
per-user rate limiting, and forwards requests to LangGraph Server over a private network.
LangGraph Server is not publicly accessible.

- Pros:
  - Full control over auth logic; can integrate any session mechanism
  - LangGraph Server entirely hidden from the internet
- Cons:
  - Extra server to build, test, and deploy — a second moving part for a curriculum project
  - Auth is now in a separate codebase, separate deploy step
  - No additional security benefit for this project's threat model vs Option A

## Decision

**Option A.** The VERIFY item is resolved — Option A works with the currently installed
`@langchain/langgraph-api@1.5.1` via the `~handlerCache` duck-typed protocol. For this
curriculum project Option B introduces a second service that adds deployment complexity without
any meaningful security improvement. Option A keeps the auth handler in the same repo and the
same Docker image.

Implementation notes for T-FS-01/T-FS-03:

- `src/auth.ts` exports a named `auth` object with `~handlerCache.authenticate`
- `langgraph.json` adds `"auth": { "path": "./src/auth.ts:auth", "disable_studio_auth": true }`
- For local dev smoke tests a simple shared bearer token in `.env` is acceptable
- For T-FS-04 the auth check is a prerequisite to reaching the agent; tests must send a valid token

## Consequences

- **Easier:** Single deploy unit; auth and agent share the same build pipeline
- **Harder:** Token issuance for real users needs an IdP or signing helper outside this repo;
  the curriculum project uses a simple env-var bearer token for testing
- **Debt:** `disable_studio_auth: true` bypasses LangGraph Studio's auth — acceptable for a
  dev-only studio workflow; revisit if studio-based demos become required

## Empirical evidence

Source inspection of `@langchain/langgraph-api@1.5.1`:

- `dist/auth/index.mjs` line 107–120: `registerAuth` loads module, checks `~handlerCache`,
  calls `handlers.authenticate(request)`, normalises response to `{ scopes, user }`
- `dist/auth/custom.mjs` line 27: `authenticate(c.req.raw)` called on every non-`/info` request
- No `Auth` class exported from either file — duck-typed protocol only
