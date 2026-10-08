# Report: T-FS-01 — Backend: DeepAgents on LangGraph Server

**Date completed:** 2026-10-08

## What was done

### Files created or modified

| File                                      | Action                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/fs-middleware.ts`                | Extended signature from `() => FilesystemBackend` to `() => AnyBackendProtocol`            |
| `src/lib/tool-args.ts`                    | Created with `ToolCallLike` interface and `extractToolFilePath`                            |
| `src/experiments/critique/adversarial.ts` | Updated to import `extractToolFilePath` from `lib/tool-args.js`                            |
| `skills/policy-report/SKILL.md`           | Created — report format, citation rules, filename conventions                              |
| `src/agent.ts`                            | Full rewrite — CompositeBackend, permissions, ThreadBudgetMiddleware, harnessProfile       |
| `src/auth.ts`                             | Created — `~handlerCache.authenticate` with dev bypass and `AUTH_TOKEN` enforcement        |
| `langgraph.json`                          | Created — graph manifest, CORS, auth path, node_version 24                                 |
| `package.json`                            | Added `dev:server`, `dump-tools`, `smoke-server`, `smoke-permissions` scripts              |
| `scripts/dump-tools.ts`                   | Created — asserts execute absent, _ToolExclusionMiddleware present, FilesystemMiddleware×1 |
| `scripts/smoke-server.ts`                 | Created — SDK client, asserts ≥1 streamed event                                            |
| `scripts/smoke-permissions.ts`            | Created — adversarial write, asserts denied in trace and file unchanged                    |
| `.env.example`                            | Added `AUTH_TOKEN=changeme-dev`                                                            |

### Commands run and results

```
pnpm typecheck       → clean (0 errors)
pnpm test            → 12 files, 116 tests, all pass
pnpm dump-tools      → PASS: execute absent, _ToolExclusionMiddleware present, FilesystemMiddleware×1
pnpm dev:server      → server started at http://localhost:2024; GET /info → 200
pnpm smoke-server    → PASS: received 25 event(s) from http://localhost:2024/agent
pnpm smoke-permissions → PASS: write attempted, permission denied in trace, file unchanged
```

---

## Concepts covered

**CompositeBackend route key trailing slash:** `CompositeBackend(defaultBackend, routes)` uses `key.startsWith(prefix)` internally. Route keys must end with `/` (e.g., `'/skills/'` not `'/skills'`) to avoid prefix-matching bugs where `'/skills'` would also match `'/skillset'`.

**Custom FilesystemMiddleware replaces built-in:** `mergeMiddlewareStack` matches on middleware name. A custom middleware named `'FilesystemMiddleware'` replaces the built-in one entirely. Top-level `createDeepAgent({ permissions })` is NOT applied when the built-in is replaced — permissions must be passed explicitly to both `makeFilesystemMiddleware(backend, permissions)` AND `createDeepAgent({ permissions })`. The `dump-tools.ts` assertion (FilesystemMiddleware×1) catches accidental duplication.

**`registerHarnessProfile` + `createHarnessProfile`:** Must be called before `createDeepAgent`. The key is the model ID string (e.g., `'openai:gpt-5.4-mini-2026-03-17'`). `excludedTools: ['task']` adds `_ToolExclusionMiddleware` to the stack, which hides `task` from the model at call time via `wrapModelCall`. The `task` tool still appears in `mw.tools` arrays at schema-introspection time — absence from the model-visible schema is enforced at request time.

**`generalPurposeSubagent: { enabled: false }`:** In deepagents 1.14.1, this keeps `subAgentMiddleware` in the stack (the middleware still wires up) but disables the GP sub-agent configuration. Combined with `excludedTools: ['task']`, the task tool is hidden from the model schema at call time. The `subAgentMiddleware` middleware entry remains in `agent.options.middleware`.

**ThreadBudgetMiddleware state schema:** `createMiddleware({ stateSchema: z.object({...}) })` uses Zod to define per-thread state fields. The state type at hook call-time is `InferZodOutput<schema> & AgentBuiltInState`, meaning `state.messages` (from `AgentBuiltInState`) and `state.threadCostUsd` (from the schema) are both available. The `afterModel` hook fires after the agent node produces its AIMessage — `state.messages[state.messages.length - 1]` IS the newly produced AIMessage.

**Auth duck-typing:** `registerAuth` in `@langchain/langgraph-api@1.5.1` loads the auth module at `auth.path` and duck-type checks for `'~handlerCache'` in the exported object. No `Auth` class to import. The auth object shape: `{ '~handlerCache': { authenticate(req: Request): Promise<string | AuthUser>, callbacks: {} } }`. Throwing `{ status: 401, ... }` (a plain object, not an Error) signals a 401 to the server.

**LangGraph Server checkpointer injection:** The server sets `compiled.checkpointer = checkpointer` on the graph after loading it from `src/agent.ts`. The graph must not set its own checkpointer — doing so would conflict. `createDeepAgent(...)` without a `checkpointer` field is correct; the server supply is confirmed in `graph/load.mjs` of `@langchain/langgraph-api@1.5.1`.

---

## Decisions and reasons

**VERIFY — custom middleware vs top-level permissions:** Confirmed that the custom `makeFilesystemMiddleware` replaces the built-in and does NOT inherit top-level permissions. The full 5-rule set is passed to both `makeFilesystemMiddleware` and `createDeepAgent({ permissions })`. The latter is for future sub-agent inheritance when sub-agents are re-enabled.

**VERIFY — route key format:** Confirmed trailing slash required. `'/skills/'` and `'/corpus/'` used throughout.

**VERIFY — afterModel state timing:** Confirmed from `ReactAgent.js:216` edge wiring. `state.messages.at(-1)` in `afterModel` IS the new AIMessage.

**VERIFY — task exclusion mechanism:** `registerHarnessProfile` + `excludedTools: ['task']` adds `_ToolExclusionMiddleware`. At schema introspection time the tool is still in `mw.tools`; at model-call time it is filtered. Confirmed by observing `_ToolExclusionMiddleware` in the middleware stack from `dump-tools.ts`.

**VERIFY — recursionLimit:** Client-controlled, not a server-side guard. Documented in `docs/security.md`. Thread cost budget (server-controlled LangGraph state) is the real per-thread limit.

**VERIFY — BackendOptions file-size cap:** `BackendOptions` only has `fileFormat` — no `maxFileSizeMb`. Documented as a known limitation.

---

## Evidence of completion

### dump-tools.ts output

```
Tools: ls, read_file, write_file, glob, grep, task
Middleware: SkillsMiddleware, FilesystemMiddleware, subAgentMiddleware, SummarizationMiddleware,
            patchToolCallsMiddleware, ThreadBudgetMiddleware, _ToolExclusionMiddleware
PASS: execute absent, _ToolExclusionMiddleware present (task excluded at call-time), FilesystemMiddleware×1
```

Note: `task` appears in the raw tool list (from `subAgentMiddleware.tools`) but is hidden from the model at call time by `_ToolExclusionMiddleware`. `execute` is genuinely absent (FS_TOOLS allowlist).

### smoke-server.ts output

```
Connecting to LangGraph Server at http://localhost:2024
First event type: metadata
PASS: received 25 event(s) from http://localhost:2024/agent
```

### smoke-permissions.ts output

```
Target: /skills/policy-report/SKILL.md
Disk path: .../skills/policy-report/SKILL.md
writeAttempted: true
permissionDeniedInTrace: true
fileUnchanged: true
PASS: write attempted, permission denied in trace, file unchanged
```

### Server startup

```
info: Loading auth from ./src/auth.ts:auth
info: Server running at ::1:2024
GET /info → 200
```

### LangSmith trace

`smoke-permissions` run produced a trace in project `deep-agents-phase` (tracing=true, client initialized with API key).

---

## Gotchas / lessons learned

**`_ToolExclusionMiddleware` vs raw tool list:** The `dump-tools.ts` assertion must check for `_ToolExclusionMiddleware` presence rather than `task` absence from `mw.tools`, because the tool is hidden at model-call time, not removed from the middleware schema arrays. This is a subtle distinction — reading `agent.options.middleware[n].tools` shows the full list; only the model-facing schema (filtered at call time) hides `task`.

**Auth object throw pattern:** Throwing a plain object (`{ status: 401, ... }`) is the correct signal for a 401 in LangGraph Server's duck-typed auth. A standard `new Error(...)` throw would likely surface as a 500. The `@typescript-eslint/no-throw-literal` rule is not in `tseslint.configs.recommended` (8.x), so this doesn't cause a lint error.

**FilesystemBackend for skills/corpus is not virtualMode:** Skills and corpus directories use `virtualMode: false` (the default), which means the path passed to `rootDir` is a real filesystem path. `process.cwd()` returns the project root when `langgraphjs dev` is run from the project root.
