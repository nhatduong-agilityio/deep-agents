# DDR-004: No Custom HTTP Server — LangGraph Server + useStream

**Date:** 2026-10-02
**Status:** Accepted

## Context

An early project draft included Fastify as an HTTP server layer to expose the agent via REST. During bootstrap it became clear that DeepAgents already compiles to a LangGraph graph, and `@langchain/langgraph-api` provides a production-grade server (`langgraphjs dev`) that serves that graph over the LangGraph wire protocol — the same protocol that `useStream` from `@langchain/react` speaks natively. Adding Fastify would duplicate this layer.

## Options Considered

### Option A: Fastify custom server

- Pros: full control over routes, middleware, auth
- Cons: requires manually wrapping graph invocation, streaming SSE, handling thread state — reimplementing what LangGraph Server already does; doubles the surface area for bugs; Fastify has no built-in LangGraph protocol support

### Option B: Express + custom streaming

- Pros: familiar to many developers
- Cons: same problems as Option A; SSE streaming in Express is boilerplate-heavy; no LangSmith tracing integration out of the box

### Option C: LangGraph Server (`langgraphjs dev`) — no custom HTTP code

- Pros: `createDeepAgent()` returns a compiled LangGraph graph → `langgraph.json` declares the graph → `langgraphjs dev` serves it at `localhost:2024`; `useStream` from `@langchain/react` connects with zero configuration beyond `apiUrl` and `assistantId`; thread lifecycle, SSE streaming, and CORS are handled by the server; the same server runs in production via `langgraphjs dockerfile`
- Cons: constrained to the LangGraph wire protocol; custom auth requires LangGraph Server's token mechanism rather than arbitrary middleware

## Decision

Option C. The fullstack path is:

```
createDeepAgent() → graph export → langgraph.json → langgraphjs dev
                                                          ↑
                                   useStream({ apiUrl, assistantId })
```

No HTTP server code exists in this repository. `langgraphjs dev` uses `tsx` (already installed) as its default loader, so `src/agent.ts` is picked up without compilation.

## Consequences

- Fastify and any related packages removed from `package.json`
- `src/agent.ts` must export `graph` as a named export — this is the contract `langgraph.json` depends on
- `langgraph.json` is the single configuration point for the server: graph path, env file, Node version, CORS origins
- Auth in production relies on LangGraph Server's `X-Api-Key` header or LangSmith-managed deployment auth (documented in T-FS-03)
- Local development requires two terminals: `pnpm dev:server` (port 2024) and `pnpm dev:web` (port 5173)

## Empirical evidence

`GET http://localhost:2024/info` returns 200 with graph metadata after `langgraphjs dev` starts. `useStream` connects and streams responses without any custom server code.
