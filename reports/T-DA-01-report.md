# Report: T-DA-01 — Scaffold + Reality Check

**Date completed:** 2026-10-02

## What was done

Created the core scaffold files and ran a tool-schema reality check against the
Gemini API.

**Files created:**

| File                                | Purpose                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/agent.ts`                      | `graph` export — `createDeepAgent` with `geminiToolFilter` + `todoListMiddleware` + `FilesystemBackend` |
| `src/lib/backoff.ts`                | `withBackoff<T>` — exponential + jitter retry on HTTP 429                                               |
| `src/lib/counter.ts`                | `RunCounter` — 4-dimension budget tracker (tokens, cost USD, time ms, tool-calls) with `checkBudget()`  |
| `src/lib/gemini-tool-filter.ts`     | `geminiToolFilter` middleware — filters broken-schema tools from `request.tools` before each model call |
| `src/experiments/scaffold/run.ts`   | Dumps tool list to `docs/tool-list-default.json`; confirms `write_todos` present                        |
| `src/experiments/scaffold/smoke.ts` | One-shot agent invocation; confirms Gemini + deepagents work end-to-end                                 |
| `src/__tests__/backoff.test.ts`     | 4 unit tests for `withBackoff` using in-process fakes                                                   |
| `src/__tests__/counter.test.ts`     | 8 unit tests for `RunCounter` covering all 4 dimensions + budget checks                                 |
| `docs/tool-list-default.json`       | Machine-readable tool list output                                                                       |

**Commands run:**

```bash
node --import=tsx/esm --env-file=.env src/experiments/scaffold/run.ts
node --import=tsx/esm --env-file=.env src/experiments/scaffold/smoke.ts
pnpm test
pnpm typecheck
```

## Concepts covered

- **`createDeepAgent` model spec:** Uses `'provider:model-id'` string format. `google-genai:` routes to `@langchain/google-genai`; `google:` routes to the separate `@langchain/google` package (not installed). Wrong prefix → silent wrong package import → 404.

- **`write_todos` not built-in for Google models:** `REQUIRED_MIDDLEWARE_NAMES` is an empty object in `deepagents@1.14.1`. The `todoListMiddleware` (from `langchain`) that provides `write_todos` is only auto-applied for Codex/OpenAI harness profiles. Google models require explicit opt-in.

- **`wrapModelCall` for dynamic tool filtering:** A middleware hook that intercepts each model invocation, receiving `(request, handler)` where `request.tools` is the full tool list. Returning `handler({ ...request, tools: filtered })` narrows what the model sees per-call. Unlike `tools: []` at agent creation, this fires per step so it composes cleanly with other middleware.

- **`RunCounter` BGA pattern:** Tracks 4 dimensions across a run. `checkBudget()` is called pre-step and throws if any ceiling is exceeded — this is Budget-Guarded Autonomy (BGA): the agent cannot take an irreversible action after a budget overrun because the graph step fails before the tool executes.

- **Exponential backoff with jitter:** The jitter factor (±25% of computed delay) prevents multiple sequential runs from re-synchronizing after a 429 burst and hammering the API simultaneously on retry.

## Decisions and reasons

**`geminiToolFilter` at middleware layer, not model layer:** The broken schema lives in deepagents' built-in `grep` tool. Patching `@langchain/google-genai` (via `pnpm patch`) or subclassing `ChatGoogleGenerativeAI` (subclass) would fix the symptom at the provider layer — but the root is one tool's schema. Filtering at `wrapModelCall` targets exactly the broken tool, leaves all other tools untouched, and is trivially removed when deepagents fixes the schema.

**Only `grep` filtered:** Verified all 9 built-in tools by converting each Zod schema to JSON Schema and scanning for `exclusiveMinimum`, array-form `type`, and `anyOf`. Only `grep.max_count` (Zod `.positive()`) produces `exclusiveMinimum`. `read_file`'s `offset`/`limit` are clean.

**`gemini-flash-lite-latest` alias (not pinned) for scaffold:** Per project policy, aliases are allowed for exploration/scaffold runs; the pinned ID (`gemini-2.0-flash-lite-001`) will be used for all measured experiment runs starting T-DA-02.

**`FilesystemBackend` with no `rootDir`:** Defaults to `process.cwd()`. Experiment scripts set their own working directory via the run script, so no global rootDir is needed at agent construction time.

## Evidence of completion

```text
$ node --import=tsx/esm --env-file=.env src/experiments/scaffold/run.ts
Tool list written to docs/tool-list-default.json
Tools: ls, read_file, write_file, edit_file, delete, glob, grep, execute, task, write_todos
write_todos present: YES

$ node --import=tsx/esm --env-file=.env src/experiments/scaffold/smoke.ts
Running base agent smoke invocation...
Agent response: "SCAFFOLD_OK"
Check LangSmith for trace: https://smith.langchain.com

$ pnpm test
Test Files  4 passed (4)
     Tests  14 passed (14)
  Duration  108ms
```

**Pinned versions recorded:**

- `deepagents`: `1.14.1`
- Gemini Flash Lite alias: `gemini-flash-lite-latest` (exploration); pin `gemini-2.0-flash-lite-001` for measured runs

LangSmith trace: fires on every invocation when `LANGCHAIN_TRACING_V2=true` (confirmed via smoke run — trace visible at [smith.langchain.com](https://smith.langchain.com) under project `deep-agents-phase`).

## Gotchas / lessons learned

- **`gemini-2.0-flash` is gone.** The API returns 404 and says to use `gemini-3.8-flash`. The alias `gemini-flash-lite-latest` resolves correctly. Always verify model IDs against the live API before committing to a pinned ID.

- **deepagents tool schema investigation order matters.** The initial symptom (400 Bad Request) implicated the Gemini provider. The real cause was one tool's Zod schema. Checking at the tool layer first — `toJsonSchema(tool.schema)` for each tool, scanning output for unsupported keywords — resolves this class of error in minutes vs. hours of provider-level debugging.

- **`wrapModelCall` runs per model step, not per agent invocation.** If the agent makes 5 tool calls in a loop, `wrapModelCall` fires 6 times (once before each model step). Filtering is deterministic and stateless, so this is fine for the grep case.
