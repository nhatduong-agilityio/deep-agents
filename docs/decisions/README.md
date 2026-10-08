# Design Decision Records (DDR)

Index of all design decisions made in this project. Each DDR is a numbered file:
`docs/decisions/DDR-XXX-<slug>.md`.

## Index

| ID      | Title                                                                  | Status                | Date       | Pattern / Task  |
| ------- | ---------------------------------------------------------------------- | --------------------- | ---------- | --------------- |
| DDR-001 | TypeScript + pnpm v11 + NodeNext ESM                                   | Accepted              | 2026-10-02 | T-DA-00.1       |
| DDR-002 | LangSmith as the Tracer (not LangFuse)                                 | Accepted              | 2026-10-02 | T-DA-00.1       |
| DDR-003 | LLM Provider Policy (CAMS)                                             | Accepted              | 2026-10-02 | CAMS; T-DA-00.1 |
| DDR-004 | No Custom HTTP Server — LangGraph Server + useStream                   | Accepted              | 2026-10-02 | T-DA-00.1       |
| DDR-005 | Measurement Discipline                                                 | Accepted              | 2026-10-02 | T-DA-00.1       |
| DDR-006 | Filesystem Backend — FilesystemBackend vs StateBackend vs Composite    | Accepted              | 2026-10-05 | FSC; T-DA-03    |
| DDR-007 | Planning Enforcement via System Prompt Instruction                     | Accepted              | 2026-10-05 | PTR; T-DA-02    |
| DDR-008 | Critique Sub-Agent Permission Design (BRC Pattern)                     | Accepted              | 2026-10-07 | BRC+PC; T-DA-05 |
| DDR-009 | Benchmark Code-Execution Environment (`new Function` vs vm vs process) | Accepted              | 2026-10-07 | T-DA-06         |
| DDR-010 | CIP Isolation Benefit Scales with Retrieval Payload vs Overhead        | Confirmed             | 2026-10-06 | CIP; T-DA-04    |
| DDR-011 | Gemini Tool Schema Filtering via wrapModelCall                         | Superseded by DDR-012 | 2026-10-02 | pre-T-DA-04     |
| DDR-012 | Switch Primary Agent Model to OpenAI gpt-5.4-mini                      | Accepted              | 2026-10-06 | T-DA-04         |
| DDR-013 | Sub-agent Filesystem Middleware Must Be Injected Per-Run with Backend  | Accepted              | 2026-10-06 | CIP; T-DA-04    |
| DDR-014 | DeepAgents vs Plain LangGraph — When Delegation Overhead Is Justified  | Accepted              | 2026-10-07 | SVW; T-DA-07    |
| DDR-015 | PC Loop: Critic as `task`-Tool Sub-Agent with Hash-Guard Middleware    | Accepted              | 2026-10-07 | BRC+PC; T-DA-05 |
| DDR-016 | Auth Strategy for LangGraph Server — Option A custom handler           | Accepted              | 2026-10-08 | T-FS-00         |
