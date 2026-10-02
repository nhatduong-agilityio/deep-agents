# DDR-001: TypeScript + pnpm v11 + NodeNext ESM

**Date:** 2026-10-02
**Status:** Accepted

## Context

The phase produces runnable experiment scripts and a fullstack demo. The choice of language and module system affects how LangChain packages resolve, whether DeepAgents type-checks cleanly, and how the LangGraph Server loader (`tsx`) picks up source files. A wrong choice here propagates to every subsequent task.

## Options Considered

### Option A: Python

- Pros: LangChain Python is the reference implementation; most examples use it; broader model SDK coverage
- Cons: DeepAgents is TypeScript-only; LangGraph Server (`langgraphjs`) is Node-only; mixing runtimes adds operational overhead

### Option B: Deno + TypeScript

- Pros: native ESM, built-in TypeScript, no `node_modules`
- Cons: `@langchain/langgraph-api` and DeepAgents assume Node module resolution; pnpm workspace support in Deno is immature; `tsx` loader not applicable

### Option C: Node 24 + TypeScript + pnpm v11 + NodeNext ESM

- Pros: DeepAgents and all `@langchain/*` packages are authored for Node; `tsx` is the default loader for `langgraphjs dev`; pnpm v11 workspaces support `apps/web/` for the frontend; `NodeNext` module resolution enforces explicit `.js` extensions, preventing resolution ambiguity at runtime
- Cons: explicit `.js` extensions on relative imports are unfamiliar to developers coming from CommonJS or bundled environments

## Decision

Option C. The entire dependency graph (DeepAgents, LangGraph, LangGraph Server) assumes Node + ESM. Using the same module system end-to-end eliminates the class of import errors that arise when CJS and ESM mix at runtime.

`NodeNext` over `bundler` resolution was chosen because the experiment scripts run directly via `tsx` (not through a bundler), so Node's native resolution rules apply.

## Consequences

- Every relative import must carry an explicit `.js` extension — enforced by `tsc --noEmit` with `moduleResolution: NodeNext`
- `pnpm-workspace.yaml` is the single config file for pnpm v11; `pnpm.yaml` is not read and was deleted (see commit history)
- Adding a frontend workspace (`apps/web/`) requires only a `packages: - 'apps/*'` entry — no additional tooling
- Python examples from LangChain docs must be mentally translated; no direct copy-paste

## Empirical evidence

`pnpm typecheck` passes with zero errors on the initial scaffold. `langgraphjs dev` resolves `src/agent.ts` via `tsx` without configuration.
