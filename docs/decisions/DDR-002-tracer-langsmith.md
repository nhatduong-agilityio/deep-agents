# DDR-002: LangSmith as the Tracer (not LangFuse)

**Date:** 2026-10-02
**Status:** Accepted

## Context

Every experiment task requires a trace URL as evidence. The tracer must support LangGraph's built-in instrumentation, require minimal integration code, and align with the curriculum's evaluation tooling. An earlier draft of the project referenced LangFuse; this DDR records why it was removed.

## Options Considered

### Option A: LangFuse

- Pros: open-source; self-hostable; strong UI for prompt management
- Cons: requires either `@langfuse/langchain` + manual OTel setup, or the legacy `langfuse-langchain` v3 wrapper; neither auto-traces LangGraph's internal spans without additional wiring; the curriculum evaluation rubric references LangSmith trace URLs, not LangFuse

### Option B: LangSmith

- Pros: auto-traces when `LANGCHAIN_TRACING_V2=true` and `LANGCHAIN_API_KEY` are set — zero code required; natively understands LangGraph node and tool spans; the curriculum rubric expects LangSmith URLs; the free tier covers all experiment volumes at sequential run rates
- Cons: cloud-only (no self-host on free tier); vendor lock-in for trace storage

### Option C: No tracer (stdout logging only)

- Pros: zero dependencies
- Cons: cannot produce the per-span token counts required by T-DA-07; cannot satisfy the evidence requirement (trace URL) for Outputs 1–3

## Decision

Option B. Auto-tracing via env vars means zero integration code in experiment scripts — tracing is on by default when keys are present and silently off when they are not. This eliminates a whole class of "forgot to add the callback" bugs.

References: [[DDR-003]] (model selection affects which spans appear in traces).

## Consequences

- `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_API_KEY`, and `LANGCHAIN_PROJECT=deep-agents-phase` must be set in `.env`
- The shared `langsmith` client in `src/index.ts` warns on startup if the key is absent — safe to run locally without tracing
- LangFuse packages removed; any future need for LangFuse would require a separate integration path
- Per-span token counts are available in LangSmith's UI and API — used directly in T-DA-07

## Empirical evidence

`pnpm dev` with `LANGCHAIN_TRACING_V2=true` produces a LangSmith run record on first execution with zero callback registration in `src/index.ts`.
