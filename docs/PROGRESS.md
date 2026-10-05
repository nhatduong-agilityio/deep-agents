# Progress Tracker

## Resume Point

**Next action:** T-DA-04 — Context Isolation Proof (Output 3)

## Pinned Versions (established T-DA-01)

| Item                             | Value                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `deepagents`                     | `1.14.1`                                                                                     |
| Gemini model (exploration alias) | `gemini-flash-lite-latest`                                                                   |
| Gemini model (measured runs)     | `gemini-3.5-flash-lite` (no versioned ID available; API date `3.5-flash-lite-07-2026` noted) |
| Model migration note             | `gemini-2.0-flash-lite-001` → `gemini-3.5-flash-lite` (deprecated 2026-10-05)                |

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

## Activity Log

| Date       | Event     | Task                                                                         | Output                          |
| ---------- | --------- | ---------------------------------------------------------------------------- | ------------------------------- |
| 2026-10-02 | Planned   | Phase: Rapid Development with DeepAgents                                     | docs/tasks.md                   |
| 2026-10-02 | Done      | T-DA-00: Project Bootstrap (TypeScript, LangSmith, Gemini, Groq, no Fastify) | package.json, src/index.ts      |
| 2026-10-02 | Updated   | docs/tasks.md restructured: T-DA-00 (done), T-DA-00.1 (initial DDRs) added   | docs/tasks.md, docs/PROGRESS.md |
| 2026-10-02 | Started   | T-DA-00.1 — Initial Decision Records                                         | —                               |
| 2026-10-02 | Completed | T-DA-00.1 — Initial Decision Records                                         | reports/T-DA-00.1-report.md     |
| 2026-10-02 | Started   | T-DA-00.2 — Skills Installation + Claude Code Hooks                          | —                               |
| 2026-10-02 | Completed | T-DA-00.2 — Skills Installation + Claude Code Hooks                          | reports/T-DA-00.2-report.md     |
| 2026-10-02 | Started   | T-DA-01 — Scaffold + Reality Check                                           | —                               |
| 2026-10-02 | Completed | T-DA-01 — Scaffold + Reality Check                                           | reports/T-DA-01-report.md       |
| 2026-10-05 | Started   | T-DA-02 — Planning-First (Output 2)                                          | —                               |
| 2026-10-05 | Completed | T-DA-02 — Planning-First (Output 2)                                          | reports/T-DA-02-report.md       |
| 2026-10-05 | Started   | T-DA-03 — Artifact Agent (Output 1)                                          | —                               |
| 2026-10-05 | Completed | T-DA-03 — Artifact Agent (Output 1)                                          | reports/T-DA-03-report.md       |
