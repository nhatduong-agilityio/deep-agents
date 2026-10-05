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

File contents are stored in the LangGraph state dict and injected back into every subsequent model
call. For a 6-file corpus (~50 KB total), the entire document set would appear in context on every
step.

- Pros: Zero disk I/O; easy to reset between runs; no path-scoping issues
- Cons: Violates FSC pattern — large corpus content inflates input tokens on every model call;
  unsuitable when context isolation matters (T-DA-04); output files are lost when the process exits

### Option B: FilesystemBackend with virtualMode (chosen)

`FilesystemBackend({ rootDir: workDir, virtualMode: true })` remaps all agent paths under
`rootDir`. The agent's `/corpus/eu-ai-act-article-5.txt` resolves to
`tmp/artifact-agent/run-{n}/corpus/eu-ai-act-article-5.txt` on disk. Files persist after the run
and can be verified by the checker script.

- Pros: FSC pattern — only file paths appear in messages; output persists for verification;
  `virtualMode: true` prevents writes outside the project (lesson from T-DA-02); easy to diff
  outputs across runs
- Cons: Requires copying corpus into the workDir before invoke; slightly more setup per run;
  disk writes add a small latency overhead (negligible for text files)

### Option C: Composite (StateBackend scratch + FilesystemBackend outputs)

Intermediate scratchpad (reasoning, partial lists) in state; final report written to disk.

- Pros: Keeps intermediate noise out of disk; only committed outputs persist
- Cons: Complex to configure; deepagents@1.14.1 does not expose a built-in composite backend —
  would require custom middleware; over-engineered for a 3-run experiment

## Decision

**Option B** — `FilesystemBackend` with `virtualMode: true` for all experiment runs.

The deciding criteria:

1. FSC pattern compliance: agent messages contain only file paths; corpus content is never
   serialised into the context window after the initial read
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

`results/artifact-agent/results.json` — 3 runs, `gemini-3.5-flash-lite`, 2026-10-05:

| Run | Input tokens | Output tokens | Model calls | Checker |
| --- | ------------ | ------------- | ----------- | ------- |
| 1   | 33,435       | 1,628         | 4           | PASS    |
| 2   | 80,691       | 1,712         | 8           | PASS    |
| 3   | 42,257       | 1,692         | 5           | PASS    |

Average: 53,805 tokens/run, 6 model calls/run. Checker pass rate: 3/3.

Token variance across runs (33 K–81 K) reflects the non-deterministic number of tool-call steps
the agent takes to read all corpus files before writing the report. The FSC pattern keeps per-step
token counts bounded: only the current file path and its content appear in the step that reads it;
subsequent steps reference only the path.
