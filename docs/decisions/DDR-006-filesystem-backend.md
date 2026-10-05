# DDR-006: Filesystem Backend Choice — FilesystemBackend vs StateBackend vs Composite

**Date:** 2026-10-05
**Status:** Accepted

## Context

T-DA-03 (Artifact Agent) requires an agent to read a corpus of regulation documents and produce a
structured `/report/` directory with multiple files. Two backend options are available in
deepagents@1.14.1: `FilesystemBackend` (writes to real or virtual disk) and `StateBackend`
(in-memory per thread). A third option — a Composite that uses StateBackend for intermediate
scratchpad and FilesystemBackend for final outputs — is also possible.

The Filesystem as Context (FSC) pattern requires large payloads to go to disk; only file paths are
kept in agent messages. This keeps the context window small and avoids re-serialising large text
blobs on every step.

Related: DDR-007 (planning enforcement), DDR-005 (measurement discipline).

## Options Considered

### Option A: StateBackend (in-memory)

Both backends load file content lazily via `read_file` tool calls — neither pre-loads corpus text
into the system prompt. The difference is WHERE files are stored between steps.

`StateBackend` stores every written file in the LangGraph state dict (`files` key). LangGraph
persists the full state via the checkpointer on every superstep. This means the checkpoint grows
with each file written, even files the agent never reads again. For a 6-file corpus (~50 KB) plus
generated report files, the checkpoint could reach hundreds of KB per superstep. Output files are
also lost when the process exits because state is in-memory.

- Pros: Zero disk I/O; easy to reset between runs; no path-scoping issues
- Cons: Checkpoint growth — every superstep persists all file content regardless of access pattern;
  output files lost on process exit; unsuitable when checkpoint size matters (T-DA-04 context isolation)

### Option B: FilesystemBackend with virtualMode (chosen)

`FilesystemBackend({ rootDir: workDir, virtualMode: true })` stores files on disk and remaps all
agent paths under `rootDir`. The checkpoint stores only file metadata (paths, sizes); file content
stays on disk. For a 6-file corpus + generated report, the checkpoint remains small regardless of
corpus size.

- Pros: Small checkpoint — only metadata checkpointed per superstep; output files persist for
  verification after the run; `virtualMode: true` prevents writes outside the project; easy to
  diff outputs across runs
- Cons: Requires copying corpus into workDir before invoke; requires `virtualMode: true` discipline
  (without it, absolute paths resolve to the real filesystem root); disk writes add negligible latency

### Option C: Composite (StateBackend scratch + FilesystemBackend outputs)

Intermediate scratchpad (reasoning, partial lists) in state; final report written to disk.

- Pros: Keeps intermediate noise out of disk; only committed outputs persist
- Cons: Complex to configure; deepagents@1.14.1 does not expose a built-in composite backend —
  would require custom middleware; over-engineered for a 3-run experiment

## Decision

**Option B** — `FilesystemBackend` with `virtualMode: true` for all experiment runs.

The deciding criteria:

1. Checkpoint hygiene: FilesystemBackend keeps the LangGraph checkpoint small (metadata only);
   StateBackend grows the checkpoint with every file written — a measurable cost for long-running
   or multi-run experiments
2. Verifiability: output files persist on disk; the deterministic `check-report.ts` script can
   verify structure and citations without an LLM judge
3. Consistency with T-DA-02: `virtualMode: true` is already established as the safe default for
   containing agent writes within the project

## Consequences

- **Easier:** Report files are accessible after each run; checker and T-DA-04 context isolation
  measurements can inspect the same output; debugging a bad run means reading the files directly
- **Harder:** Corpus must be copied into each run's workDir before invoke; `tmp/artifact-agent/`
  grows with each run set (excluded from git via `.gitignore`)
- **Technical note:** Without `virtualMode: true`, agent absolute paths (e.g. `/report/summary.md`)
  resolve to the real root — ENOENT at `/report/` causes the agent to fall back to alternative
  paths, typically the home directory. Always use `virtualMode: true` for contained experiments.

## Empirical evidence

`results/artifact-agent/results.json` — 3 re-runs after hardening, `gemini-3.5-flash-lite`, 2026-10-05:

| Run | Input tokens | Peak input/call | Model calls | Checker |
| --- | ------------ | --------------- | ----------- | ------- |
| 1   | 33,489       | 12,710          | 4           | PASS    |
| 2   | 33,456       | 12,677          | 4           | PASS    |
| 3   | 33,595       | 12,816          | 4           | PASS    |

`inputTokensPerCall: [4688, 4855, 11236, 12710]` (run 1, `results/artifact-agent/results.json`,
langsmithRunId `6c5bc989-e37a-4f26-853c-edff497322e9`). Corpus content (+6,381 tokens) enters
context at call 3 and persists through call 4 (+1,474 from write_file results). Peak is at call 4
(12,710), not call 1.

**Token impact of backend choice (StateBackend vs FilesystemBackend) is NOT measured here.** Both
backends load files lazily via `read_file`; the per-model-call token counts would be the same. The
difference is in checkpoint size per superstep, which was not instrumented. Proposed future
experiment: run identical 3 runs with `StateBackend`, log `JSON.stringify(state).length` before
each superstep via a `wrapModelCall` middleware, and compare to FilesystemBackend baseline.
