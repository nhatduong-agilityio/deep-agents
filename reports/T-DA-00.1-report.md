# Report: T-DA-00.1 — Initial Decision Records

**Date completed:** 2026-10-02

## What was done

Created five Design Decision Records documenting architecture decisions settled
during bootstrap. All files written to `docs/decisions/`:

| File                                | Decision                                                    |
| ----------------------------------- | ----------------------------------------------------------- |
| `DDR-001-tech-stack.md`             | TypeScript + pnpm v11 + NodeNext ESM over Python/Deno       |
| `DDR-002-tracer-langsmith.md`       | LangSmith as tracer; LangFuse removed                       |
| `DDR-003-llm-provider-policy.md`    | Gemini Flash primary; Groq single-call; Qwen3 banned        |
| `DDR-004-no-http-server.md`         | LangGraph Server + useStream; Fastify removed               |
| `DDR-005-measurement-discipline.md` | Sequential runs, 429 backoff, exact pinning, trace metadata |

Updated `docs/decisions/README.md` index with all 5 entries.

Also updated `docs/tasks.md` to fix a structural problem: DDR-006 through DDR-010
were originally batched into T-DA-08, meaning they would be written weeks after the
decisions were made. Moved each DDR to its originating experiment task (T-DA-02,
T-DA-03, T-DA-05, T-DA-07) as an inline DoD item. T-DA-08 demoted to verification
gate + phase report only.

## Concepts covered

- **Design Decision Record (DDR):** A short structured document that captures the
  _why_ behind an architecture choice — context, alternatives, and consequences.
  The key rule: write it at the moment the decision is made, while empirical
  evidence is fresh. A DDR written after the fact loses the nuance of what was
  actually observed.

- **Cross-referencing DDRs:** Decisions that constrain each other should link
  explicitly (`[[DDR-NNN]]`). DDR-002 (LangSmith) references DDR-003 (model policy)
  because model selection affects which spans appear in traces. DDR-003 references
  DDR-005 because measurement discipline mandates pinned model IDs. These links
  prevent later readers from treating related decisions as independent.

- **Inline vs deferred DDR writing:** Writing a DDR at the end of a phase (deferred)
  risks losing the empirical evidence and the actual decision context. Writing it
  inline — as a DoD item in the task where the decision is made — keeps the DDR
  honest and forces the author to include real measurement data.

## Decisions and reasons

**Why write bootstrap DDRs separately from experiment DDRs:** Bootstrap decisions
(stack, tracer, provider, server, measurement) were settled before any experiment
ran. They can be written with complete information now. Experiment DDRs (DDR-006
through DDR-010) depend on observed data that does not exist yet — they cannot be
written until the experiments run.

**Why move DDR-006–010 out of T-DA-08:** The original design would have produced
DDRs written 2–6 weeks after the decisions were made. The "Empirical evidence"
section of a DDR is only meaningful if it cites the actual run output. Deferring
to T-DA-08 guaranteed that section would be filled with reconstructed guesses
rather than real logs.

## Evidence of completion

```
docs/decisions/
├── DDR-001-tech-stack.md               (4 sections ✓)
├── DDR-002-tracer-langsmith.md         (4 sections ✓, refs DDR-003)
├── DDR-003-llm-provider-policy.md      (4 sections ✓, refs DDR-005)
├── DDR-004-no-http-server.md           (4 sections ✓)
├── DDR-005-measurement-discipline.md   (4 sections ✓, refs DDR-003)
├── README.md                           (5 index entries ✓)
└── TEMPLATE.md
```

No LangSmith trace — this task produced only documentation.

## Gotchas / lessons learned

- **DDR-009 was already inline in T-DA-06** before this restructuring — it was the
  only one correctly placed. Used it as the reference pattern when moving the others.
- The T-DA-08 DDR table had a 4-column body with a 3-column header (pattern
  citations were added to rows without adding the header column). Fixed by adding
  the `Pattern reference` header column.
- cSpell flags project-specific terms (`deepagents`, `langgraph`, `Groq`, `CETC`,
  etc.) throughout docs. These are false positives — add a `.cspell.json` in T-DA-01
  or later if the noise becomes a problem.
