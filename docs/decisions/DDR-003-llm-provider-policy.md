# DDR-003: LLM Provider Policy (CAMS — Cost-Aware Model Selection)

**Date:** 2026-10-02
**Status:** Accepted

## Context

The phase runs 10–20 experiment iterations per task plus a 20-problem benchmark. On a free tier, every unnecessary model call burns quota. Additionally, Groq's function-calling implementation has a known failure mode with Qwen3's reasoning-block output that produces `BadRequestError` silently mid-loop — a hard constraint, not a preference.

This DDR applies the Cost-Aware Model Selection (CAMS) pattern: define explicit routing rules so every model call goes to the right provider without per-call decisions.

## Options Considered

### Option A: Gemini Flash for everything

- Pros: single provider, simplest key management
- Cons: Gemini Flash is slower for single-shot tasks (summarization, judging) where Groq's low-latency matters; wastes quota on calls that don't need multi-turn context

### Option B: GPT-4o as primary

- Pros: strong function-calling, good docs
- Cons: no free tier; cost at experiment volumes would exceed budget; not available without a paid key

### Option C: Gemini Flash (primary) + Groq (single-call only)

- Pros: Gemini Flash handles multi-turn tool-calling loops where context length and function-call reliability matter; Groq's low latency and free tier handle single-shot judging and summarization cheaply; keeps cost near zero at experiment volumes
- Cons: two API keys to manage; Groq routing must be enforced at the code level — accidental multi-turn Groq use causes `BadRequestError`

## Decision

Option C. The CAMS routing policy is:

| Role                     | Provider     | Model                                           | Constraint                                     |
| ------------------------ | ------------ | ----------------------------------------------- | ---------------------------------------------- |
| Multi-turn agent loops   | Gemini Flash | `gemini-2.0-flash-001` (pinned for measurement) | Primary for all DeepAgents runs                |
| Exploration / dev        | Gemini Flash | `gemini-2.0-flash` (alias)                      | Alias acceptable; never in measured runs       |
| LLM judge, summarization | Groq         | `llama-3.3-70b-versatile`                       | Single call only — never in loops              |
| **Banned**               | Groq         | Qwen3 any variant                               | Breaks function-calling with `BadRequestError` |

References: [[DDR-005]] (version pinning for measured runs). [[DDR-012]] supersedes the
"Multi-turn agent loops" row of the routing table below for T-DA-04 and later tasks
(switched to OpenAI `gpt-5.4-mini-2026-03-17` after Gemini daily quota exhaustion).

## Consequences

- `src/lib/models.ts` (created in T-DA-01) encodes this policy; call sites import from there, never constructing providers directly
- Groq must never appear in a loop — enforced by code review and the hard constraint in `CLAUDE.md`
- The Gemini Flash alias (`gemini-2.0-flash`) is acceptable in T-DA-01 for tool-list discovery; all subsequent measured tasks must use the pinned versioned ID
- If Groq adds Qwen3 function-calling support, re-evaluate — but do not assume compatibility without testing

## Empirical evidence

Qwen3 on Groq in a multi-turn tool-calling loop produces `BadRequestError: 400` at the second tool call. Observed during early exploration; not retested after the ban was established.
