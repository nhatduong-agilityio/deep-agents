# Design Decision Records (DDR)

Index of all design decisions made in this project. Each DDR is a numbered file:
`docs/decisions/DDR-XXX-<slug>.md`.

## Index

| ID      | Title                                                                 | Status                | Date       |
| ------- | --------------------------------------------------------------------- | --------------------- | ---------- |
| DDR-001 | TypeScript + pnpm v11 + NodeNext ESM                                  | Accepted              | 2026-10-02 |
| DDR-002 | LangSmith as the Tracer (not LangFuse)                                | Accepted              | 2026-10-02 |
| DDR-003 | LLM Provider Policy (CAMS)                                            | Accepted              | 2026-10-02 |
| DDR-004 | No Custom HTTP Server — LangGraph Server + useStream                  | Accepted              | 2026-10-02 |
| DDR-005 | Measurement Discipline                                                | Accepted              | 2026-10-02 |
| DDR-006 | Filesystem Backend — FilesystemBackend vs StateBackend vs Composite   | Accepted              | 2026-10-05 |
| DDR-007 | Planning Enforcement via System Prompt Instruction                    | Accepted              | 2026-10-05 |
| DDR-010 | CIP Isolation Benefit Scales with Retrieval Payload vs Overhead       | Hypothesis            | 2026-10-06 |
| DDR-011 | Gemini Tool Schema Filtering via wrapModelCall                        | Superseded by DDR-012 | 2026-10-02 |
| DDR-012 | Switch Primary Agent Model to OpenAI gpt-5.4-mini (T-DA-04)           | Accepted              | 2026-10-06 |
| DDR-013 | Sub-agent Filesystem Middleware Must Be Injected Per-Run with Backend | Accepted              | 2026-10-06 |
