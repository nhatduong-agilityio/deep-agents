# DDR-012: Switch Primary Agent Model to OpenAI gpt-5.4-mini (T-DA-04)

**Date:** 2026-10-06
**Status:** Accepted
**Supersedes:** DDR-003 (CAMS routing table row for "Multi-turn agent loops") for T-DA-04 and later tasks

## Context

T-DA-04 requires at least 6 measured agent runs (3×Config A + 3×Config B). The original primary
model (DDR-003) was `gemini-2.0-flash-001` / `gemini-3.5-flash-lite` on Gemini's free tier.

Two failure modes exhausted the Gemini path during T-DA-04 measurement:

1. **Daily quota exhaustion**: `gemini-3.5-flash-lite` free tier = 500 req/day. Repeated measurement
   attempts (each consuming 8–12 model calls across main agent + sub-agents) exhausted the quota.
   `withBackoff` correctly does **not** retry `RateLimitQuotaExhaustedError` — only HTTP 429 (RPM).
2. **Alternative quota also rate-limited**: `gemini-3.1-flash-lite` (separate daily quota) returned
   HTTP 429 with `Retry-After: 941s` on the first call — effectively a day-scale block.

Groq's current free-tier models do not support function calling, ruling it out for agent loops.

## Options Considered

### Option A: Wait for Gemini quota to reset

- Pros: preserves DDR-003; T-DA-04 results directly comparable with T-DA-02/03
- Cons: 24-hour daily reset cycle; repeated failures will exhaust quota again; blocks the phase

### Option B: OpenAI gpt-5.4-mini (Tier 1)

- Pros: 500 RPM / 200K TPM — sufficient for 6-run measurement with 5s/10s inter-run delays;
  tool-calling is reliable; `@langchain/openai@1.6.2` already installed
- Cons: T-DA-04 token counts are not directly comparable with T-DA-02/03 (Gemini); costs
  are non-zero (billing applies); price table unverified for this model

### Option C: Self-hosted / local model (Ollama)

- Pros: no quota
- Cons: unknown function-calling reliability; no LangSmith tracing integration; not on-path

## Decision

Option B. OpenAI gpt-5.4-mini pinned to dated snapshot `gpt-5.4-mini-2026-03-17` (confirmed from
live API response body). Alias `gpt-5.4-mini` must not be used in measured runs per DDR-005.

CAMS routing table update (T-DA-04+):

| Role                                 | Provider | Model                     | Constraint                                    |
| ------------------------------------ | -------- | ------------------------- | --------------------------------------------- |
| Multi-turn agent loops (measured)    | OpenAI   | `gpt-5.4-mini-2026-03-17` | Pinned snapshot                               |
| Multi-turn agent loops (dev/explore) | OpenAI   | `gpt-5.4-mini`            | Alias acceptable in dev only                  |
| LLM judge, summarization             | Groq     | (paid tier)               | Single call only — not available on free tier |

## Consequences

- **Comparability**: T-DA-04 token counts and costs are **not directly comparable** with T-DA-02/03
  (Gemini). The isolation ratio (Config B peak / Config A peak) is a within-experiment relative
  metric, so it remains valid. Cross-task absolute token numbers should not be compared.
- `runArtifactRun` now accepts a `ModelConfig` parameter (model, modelId, costPer1MInput,
  costPer1MOutput). `measure.ts` defines `MEASUREMENT_MODEL` as the single source of truth and
  passes it to both `runConfigARun` and `runConfigBRun`, ensuring A and B are provably identical.
- `geminiToolFilter` (removes `grep` due to Gemini JSON Schema bug) is kept in both configs.
  It is harmless for OpenAI — the tool is simply absent from the list OpenAI receives.
- `todoListMiddleware` is kept. Required for Google models; harmless for OpenAI.
- Costs: price table verified 2026-10-06 from `developers.openai.com/api/docs/pricing`:
  `gpt-5.4-mini` standard pricing = **$0.75 input / $4.50 output per 1M tokens**.
  Updated in `DEFAULT_MODEL_CONFIG` (`costPer1MInput: 0.75`, `costPer1MOutput: 4.50`).
  Note: the previous values (0.075 / 0.3) were the _cached_ input price and an unrelated carry-over
  from the Gemini config — approximately 10× lower than actual standard pricing.
- Rate limits confirmed from live response headers: 500 RPM, 200K TPM. The 5s/10s inter-run
  delays in `measure.ts` are safe at this limit.

## Empirical evidence

```
curl -s -D - POST https://api.openai.com/v1/chat/completions \
  -d '{"model":"gpt-5.4-mini","messages":[...]}'
# Response body: "model": "gpt-5.4-mini-2026-03-17"
# Headers: x-ratelimit-limit-requests: 500, x-ratelimit-limit-tokens: 200000
```
