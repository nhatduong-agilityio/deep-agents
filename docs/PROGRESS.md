# Progress Tracker

## Resume Point

**Next action:** T-DA-07 — "Loses the Plot" Trace Analysis

## Pinned Versions (established T-DA-01)

| Item                     | Value                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `deepagents`             | `1.14.1`                                                                           |
| Primary model (all runs) | `gpt-5.4-mini-2026-03-17` (`openai:gpt-5.4-mini-2026-03-17`) — migrated 2026-10-06 |
| Model pricing            | $0.75/$4.50 per 1M tokens (input/output) — verified 2026-10-06                     |
| Previous model           | `gemini-3.5-flash-lite` — replaced; T-DA-02/03/04 results reflect Gemini pricing   |

## Pinned Models (T-DA-05 finding)

| Role                 | Model ID             | Notes                                                                                                           |
| -------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Groq precision judge | `openai/gpt-oss-20b` | `llama-3.3-70b-versatile` returned 404; only text models available: `openai/gpt-oss-20b`, `openai/gpt-oss-120b` |

## Investigation Findings

### `execute` tool with FilesystemBackend (2026-10-05)

**Observation:** `execute` appears in `docs/tool-list-default.json` (generated T-DA-01 with default
`StateBackend`) and would appear when using `FilesystemBackend` as well.

**Root cause:** deepagents registers ALL `FILESYSTEM_TOOL_NAMES` (`ls`, `read_file`, `write_file`,
`edit_file`, `delete`, `glob`, `grep`, `execute`) at middleware initialization time. The docs state
"`execute` is only visible when the resolved backend supports command execution" — but this filtering
happens at **request time**, not at init time. When `tool-list-default.json` was captured (before
any invocation), the filter had not yet run.

`FilesystemBackend` and `StateBackend` both implement `BackendProtocolV2` (not
`SandboxBackendProtocolV2`), so `isSandboxBackend()` returns `false`. At request time the runtime
should filter out `execute`. However, if it does not (e.g., a future version regression), a model
that calls `execute` against a non-sandbox backend would receive a runtime error rather than a
tool-schema validation error — a worse user experience than rejecting it upfront.

**Action:** In T-DA-05 critic agent, explicitly pass `tools: ["read_file", "ls", "glob", "write_file"]`
to `createFilesystemMiddleware` to guarantee `execute` and `grep` are absent from the tool schema,
independent of backend capability detection. Do not rely on runtime filtering alone.

**No code change made** — this is a documentation finding. The tasks.md T-DA-05 DoD has been
updated to require explicit `execute` exclusion.

### Task tool concurrency in deepagents@1.14.1 (2026-10-05)

**Question:** Does the `task` tool execute sub-agents sequentially or concurrently?

**Finding:** deepagents@1.14.1 supports **parallel sub-agent invocation**. When the model
issues multiple `task` tool calls in a single message turn, they run concurrently. Evidence from
`node_modules/deepagents/dist/langsmith-Bgi_Ta-k.js`:

- Line 1908: "This reducer enables concurrent updates from parallel subagents"
- Line 3627: System prompt instructs model to "Launch multiple agents concurrently when their
  tasks are independent, using a single message with multiple tool calls"
- Line 5300: "Multiple async subagents can run concurrently"
- Line 6873: "whenever you have independent steps — make tool_calls, or kick off tasks (subagents)
  in parallel to accomplish them faster"

Each `task` tool call spawns one sub-agent. When the model issues N `task` calls in one message,
deepagents dispatches all N sub-agents concurrently via async execution, then merges their outputs.

**Implication for T-DA-04:** Config B (single sub-agent delegation) issues one `task` call per run,
so concurrency is not a confounding factor. For future multi-sub-agent experiments, sub-agents run
in parallel by default — sequential behaviour would require explicit coordination logic.

---

## A1 LangSmith Re-query Note (2026-10-06)

Original B1 measurement (validation-run.json) showed only 6 LangSmith spans and
`systemInputTokens: 45,521` for Config A run 1. Re-query of the same runId later that session
returned **7 spans, total 57,077 tokens**. Span 7 (the 7th main-agent call, 11,556 prompt tokens)
had not yet been indexed when the first `collectSystemTokens` poll completed.

This confirmed the need for the polling loop (poll every 5s, return only when span count is stable
across 2 consecutive polls). The polling loop was the fix; `measurementIncomplete:true` is the
safety valve when it times out.

Evidence snapshot (runId `c2f857f4-9da1-425a-b4b3-52403b011385`):

- After first poll: 6 spans, sum = 45,521 tokens, `mainAgentPeakInputTokens` = 11,441 (span 6)
- After re-query: 7 spans, sum = 57,077 tokens, `peakInputTokens` from messages = 11,556 (call 7)
- `inputTokensPerCall` from AIMessage.usage_metadata (messages, not LangSmith): all 7 calls captured immediately, peak = 11,556 — this is the source of truth for the T-DA-04 ratio gate

## Activity Log

| Date       | Event     | Task                                                                                                                       | Output                                                                          |
| ---------- | --------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 2026-10-02 | Planned   | Phase: Rapid Development with DeepAgents                                                                                   | docs/tasks.md                                                                   |
| 2026-10-02 | Done      | T-DA-00: Project Bootstrap (TypeScript, LangSmith, Gemini, Groq, no Fastify)                                               | package.json, src/index.ts                                                      |
| 2026-10-02 | Updated   | docs/tasks.md restructured: T-DA-00 (done), T-DA-00.1 (initial DDRs) added                                                 | docs/tasks.md, docs/PROGRESS.md                                                 |
| 2026-10-02 | Started   | T-DA-00.1 — Initial Decision Records                                                                                       | —                                                                               |
| 2026-10-02 | Completed | T-DA-00.1 — Initial Decision Records                                                                                       | reports/T-DA-00.1-report.md                                                     |
| 2026-10-02 | Started   | T-DA-00.2 — Skills Installation + Claude Code Hooks                                                                        | —                                                                               |
| 2026-10-02 | Completed | T-DA-00.2 — Skills Installation + Claude Code Hooks                                                                        | reports/T-DA-00.2-report.md                                                     |
| 2026-10-02 | Started   | T-DA-01 — Scaffold + Reality Check                                                                                         | —                                                                               |
| 2026-10-02 | Completed | T-DA-01 — Scaffold + Reality Check                                                                                         | reports/T-DA-01-report.md                                                       |
| 2026-10-05 | Started   | T-DA-02 — Planning-First (Output 2)                                                                                        | —                                                                               |
| 2026-10-05 | Completed | T-DA-02 — Planning-First (Output 2)                                                                                        | reports/T-DA-02-report.md                                                       |
| 2026-10-05 | Started   | T-DA-03 — Artifact Agent (Output 1)                                                                                        | —                                                                               |
| 2026-10-05 | Completed | T-DA-03 — Artifact Agent (Output 1)                                                                                        | reports/T-DA-03-report.md                                                       |
| 2026-10-06 | Started   | T-DA-04 — Context Isolation Proof (Output 3)                                                                               | —                                                                               |
| 2026-10-06 | Blocked   | T-DA-04 — daily quota exhausted (500 req/day); partial results saved                                                       | results/context-isolation/partial-results.json                                  |
| 2026-10-06 | Completed | T-DA-04 — Context Isolation Proof (Output 3)                                                                               | reports/T-DA-04-report.md                                                       |
| 2026-10-06 | Completed | T-DA-04 v2 — expanded corpus to 8 files (~38.5KB); gate PASS 0.3286                                                        | results/context-isolation/results-v2.json                                       |
| 2026-10-07 | Started   | T-DA-05 — Critique Workflow                                                                                                | —                                                                               |
| 2026-10-07 | Completed | T-DA-05 — Critique Workflow                                                                                                | reports/T-DA-05-report.md                                                       |
| 2026-10-07 | Updated   | T-DA-05 — Deviation resolved: critic as task-tool sub-agent (DDR-015)                                                      | reports/T-DA-05-report.md (appended)                                            |
| 2026-10-07 | Updated   | T-DA-05 — Mentor review: v2 run evidence, seeded-flaw table, DDR-008 re-analysis                                           | reports/T-DA-05-report.md, DDR-008, results/critique/supervisor-results.json    |
| 2026-10-07 | Fixed     | analyzeAdversarialTrace extracted; file_path detection bug fixed; 4 new tests                                              | src/experiments/critique/adversarial.ts, critique-supervisor.test.ts            |
| 2026-10-07 | Fixed     | process.exit(0) added to all 5 experiment scripts — shell no longer hangs after LangSmith flush                            | supervisor-run.ts, run.ts, validate-step5.ts, measure.ts, artifact-agent/run.ts |
| 2026-10-07 | Re-opened | T-DA-05 — final-revision DoD bullet unchecked; feedbackRead bug corrected; judge calibration FAILED; v2 cost split by role | reports/T-DA-05-report.md, docs/tasks.md                                        |
| 2026-10-07 | Started   | T-DA-06 — Harness Optimization Drills                                                                                      | —                                                                               |
| 2026-10-07 | Completed | T-DA-06 — Harness Optimization Drills                                                                                      | reports/T-DA-06-report.md                                                       |
| 2026-10-07 | Completed | T-DA-06 v2 — deep-agent coding benchmark (run_tests tool, isolated child_process, 5 middleware steps)                      | reports/T-DA-06-v2-report.md, results/harness-v2/results.json                   |
