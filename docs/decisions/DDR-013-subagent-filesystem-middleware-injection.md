# DDR-013: Sub-agent Filesystem Middleware Must Be Injected Per-Run with Backend

**Date:** 2026-10-06
**Status:** Accepted
**Related:** DDR-006 (FilesystemBackend), DDR-011 (sub-agent middleware inheritance — same property applies to filesystem middleware)

## Context: RC1 and RC2 Root Causes

T-DA-04 Config B had two filesystem bugs that prevented sub-agents from reading corpus files
and the main agent from writing report files to disk.

### RC1 — Research sub-agent cannot read `/corpus/`

`RESEARCH_SUBAGENT_BASE` carried `createFilesystemMiddleware({permissions})` **without** a
`backend:` option. `createFilesystemMiddleware` default (source line 2592 of
`langsmith-Bgi_Ta-k.js`):

```js
const { backend = (runtime) => new StateBackend(runtime), ... } = options;
```

`StateBackend` is an in-memory store scoped to the current thread. It is empty at sub-agent
spawn time — the corpus files copied to `workDir/corpus/` on disk are invisible to it.

**Evidence from B1 validation run** (`validation-run.json`):

- `workerReturnTokens: [70, 32]`, `workerReturnWordCounts: [44, 19]` — workers returned
  text but reported no actual corpus content (corpus unreadable)
- `checkerPassed: false`, `findingCount: 0` — main agent had no real findings to write
- `workDir` file tree: only the 6 corpus files exist; no `/notes/`, no `/report/` files

### RC2 — Main agent `write_file` calls go to `StateBackend`, not disk

Config B's `createDeepAgent` middleware stack included
`createFilesystemMiddleware({permissions: [deny /corpus/** reads]})` also without `backend:`.

deepagents' `mergeMiddlewareStack` merges user-supplied middleware into the default stack by
**name**. Both the user-supplied middleware and the internal deepagents filesystem middleware are
named `'FilesystemMiddleware'` — the user-supplied one wins and replaces the backend-aware
internal one. With `StateBackend` as the active backend, `write_file /report/summary.md`
writes to memory. The file never appears on disk, so `checkReport` finds nothing.

**Evidence:** `checkReport(workDir)` returns `{passed: false, findingCount: 0}` even though the
agent makes `write_file` tool calls and receives success responses. The workDir on disk only
contains the 6 corpus files.

## Decision: Use a Shared Builder that Requires an Explicit Backend

**Rule:** `createFilesystemMiddleware` must never be called directly in T-DA-04 code. All calls
go through `makeFilesystemMiddleware(backend, permissions)` in `src/lib/fs-middleware.ts`, which
forces an explicit `backend:` parameter.

The run backend factory (`() => new FilesystemBackend({rootDir: workDir, virtualMode: true})`) is
created once in `runConfigBRun` and passed to every `makeFilesystemMiddleware` call.

**Middleware injection for research sub-agent (RC1 fix):**

```typescript
// In runConfigBRun — per-run, not at module load time
const backendFactory = (): FilesystemBackend =>
  new FilesystemBackend({ rootDir: workDir, virtualMode: true });
const workerFsMw = makeFilesystemMiddleware(backendFactory, [
  { operations: ['write'], paths: ['/notes/**'], mode: 'allow' },
  { operations: ['write'], paths: ['/**'], mode: 'deny' },
]);
const researchSubagent: SubAgent = {
  ...RESEARCH_SUBAGENT,
  middleware: [workerFsMw], // RESEARCH_SUBAGENT.middleware is [] (no static shims)
};
```

`RESEARCH_SUBAGENT` in `subagents.ts` now carries an empty static middleware array (`[]`).
The filesystem middleware is injected at run construction time.

**Main agent corpus-block middleware (RC2 fix):**

```typescript
const mainFsMw = makeFilesystemMiddleware(backendFactory, [
  { operations: ['read'], paths: ['/corpus/**'], mode: 'deny' },
]);
const agent = createDeepAgent({
  model: ..., middleware: [mainFsMw],
  backend: backendFactory, subagents: [GENERAL_PURPOSE_SUBAGENT, researchSubagent],
});
```

## Key Gotchas

### 1. Sub-agent middleware is NOT inherited from the parent

`createSubAgent` (deepagents source line 3779) takes only `spec.middleware`. There is no
propagation of the parent agent's `backend:` or custom middleware to sub-agents.

This is the same gotcha documented in DDR-011 for `geminiToolFilter` (now superseded, but the
inheritance rule persists): parent middleware is not propagated to sub-agents regardless of type.
The filesystem middleware backend has the same property: must be added explicitly.

### 2. User-supplied filesystem middleware replaces the internal one (by name)

`mergeMiddlewareStack` matches middleware by name. `createFilesystemMiddleware` always returns a
middleware named `'FilesystemMiddleware'`. When the user supplies one, it replaces the internal
deepagents filesystem middleware. If the user's copy omits `backend:`, the run loses disk access.

### 3. Static sub-agent definitions cannot carry run-specific backends

Sub-agent specs defined at module load time (e.g. in `subagents.ts`) are singletons. They cannot
reference a `workDir` that only exists during `runConfigBRun`. Any run-specific resource (backend,
dynamic permissions) must be injected by spreading the spec and overriding `middleware` at call
time.

## Consequences

- `RESEARCH_SUBAGENT` in `subagents.ts` has no filesystem middleware and no static shims. Static
  tests updated to assert this (empty middleware array: `[]`).
- `makeFilesystemMiddleware` is the single call site for `createFilesystemMiddleware` in T-DA-04.
- `verifyNoDuplicateTools` in `measure.ts` updated to use the builder (consistent, no direct calls).
- `checkWritesOnDisk` post-run guard added to `runConfigBRun` — verifies main-agent write_file
  targets exist on disk after each run; result recorded in `RunResult.writesOnDisk`.
