# DDR-011: Gemini Tool Schema Filtering via wrapModelCall Middleware

**Date:** 2026-10-02
**Status:** Accepted

## Context

`deepagents@1.14.1` ships a built-in `grep` tool whose `max_count` parameter is
defined with Zod `.positive()`. That schema compiles to
`{ exclusiveMinimum: 0, anyOf: [{ type: "number" }, { type: "null" }] }` — two
keywords (`exclusiveMinimum`, null-union `anyOf`) that the Gemini API (as exposed
via `@langchain/google-genai`) rejects with HTTP 400 on every model invocation.

All 9 built-in tool schemas were verified (`toJsonSchema(tool.schema)` for each);
only `grep.max_count` produces the offending keywords. The bug lives in the library,
not in our code, and the fix belongs in a future deepagents release.

## Options Considered

### Option A: pnpm patch `deepagents`

Apply a pnpm patch to rewrite `grep`'s Zod schema in `node_modules/deepagents`.

- Pros: fixes the schema at the source; grep is available to the model.
- Cons: patch must be re-applied on every `pnpm install`; breaks silently when
  deepagents updates; ties our repo to the exact internal file layout of the
  library; high maintenance surface for a temporary workaround.

### Option B: Subclass `ChatGoogleGenerativeAI` and override `bindTools`

Override `bindTools` to sanitize schemas before passing them to the provider.

- Pros: intercepts at the provider layer; grep schema could be fixed rather than
  dropped.
- Cons: **tested and failed** — `bindTools` calls `convertToolsToGenAI` internally
  before the override receives the tools; by the time our override fires, conversion
  has already happened. There is no public hook to sanitize at this stage without
  forking the provider package.

### Option C: `wrapModelCall` middleware — filter broken tools per model step

Add a `createMiddleware({ wrapModelCall })` that intercepts each model invocation,
filters `request.tools` to remove known-broken tools, then calls `handler` with the
cleaned list.

- Pros: minimal blast radius (only `grep` is removed); operates at the harness
  layer we own; reversible by deleting one middleware entry; per-step so it composes
  correctly with other middleware; zero changes to library code.
- Cons: `grep` is unavailable to the model for the lifetime of the filter; must be
  removed manually when upstream fixes the schema (a known, tracked action).

### Option D: Switch primary model away from Gemini

Move to a provider that accepts `exclusiveMinimum`.

- Pros: grep works out of the box.
- Cons: contradicts DDR-003 (Gemini as primary for cost reasons); changes the
  measured system; disproportionate response to a single broken tool field.

## Decision

**Option C — `wrapModelCall` middleware filter.**

Criteria that decided it:

1. **Blast radius:** affects exactly one tool (`grep`), nothing else.
2. **Reversibility:** the filter is a one-line deletion when upstream ships a fix.
3. **No library mutation:** does not touch `node_modules` or fork any package.
4. **Consistent with DDR-003:** Gemini stays as the primary model.
5. **Empirically the only workable option:** Option B was coded and tested; it fails
   at the provider's internal conversion stage.

## Consequences

- `grep` is unavailable to the model for all runs using `geminiToolFilter`.
  Current experiment tasks (T-DA-01 through T-DA-07) require only
  `ls`, `glob`, `read_file`, and `write_file` — the absence of `grep` does not
  affect any DoD.
- If `grep`-like functionality is needed, a custom tool with a clean Zod schema
  (`.min(1)` instead of `.positive()`) can be added alongside the filter.
- The filter must be removed (or at least re-evaluated) when deepagents ships a
  schema fix. The set name `GEMINI_BROKEN_TOOLS` is the removal signal.
- `wrapModelCall` fires once per model step (not once per agent invocation), so the
  filter runs redundantly on every step — acceptable because the operation is O(n)
  on a small, fixed tool list.

## Empirical evidence

Tool-schema scan run during T-DA-01:

```text
grep          max_count  → { exclusiveMinimum: 0, anyOf: [{type:"number"},{type:"null"}] }  ← BROKEN
ls            (no params with issues)
read_file     offset/limit use z.number().optional() → { type: "number" }                   ← clean
write_file    (no numeric params)
edit_file     (no numeric params)
delete        (no numeric params)
glob          (no numeric params)
execute       (no numeric params)
task          (no numeric params)
write_todos   (no numeric params)
```

Smoke run without filter: HTTP 400 on first model call.
Smoke run with `geminiToolFilter`: agent responds `"SCAFFOLD_OK"` (LangSmith trace
confirmed, see `reports/T-DA-01-report.md`).
