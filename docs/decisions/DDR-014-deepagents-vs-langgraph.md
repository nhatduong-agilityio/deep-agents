# DDR-014: DeepAgents vs Plain LangGraph — When Delegation Overhead Is Justified

**Date:** 2026-10-07
**Status:** Accepted (evidence revised 2026-10-07 — see changelog at end)

## Context

DeepAgents wraps LangGraph with an opinionated harness: automatic filesystem middleware,
a built-in `task` tool for sub-agent delegation, `write_todos` planning support, and
a middleware stack system. This convenience has a measurable token overhead. Every
sub-agent invocation dispatches a fresh LangGraph run with its own system prompt and
context window — the `task` ToolMessage content depends on the sub-agent's final
response (e.g., T-DA-04 research workers returned 244–574-token retrieval summaries;
T-DA-05 critic returned only "Task completed" because its output was written to disk).

Two questions arose during T-DA-04 through T-DA-07:

1. Is the DeepAgents overhead justified by actual context-isolation gains?
2. For which workload shapes does DeepAgents outperform plain LangGraph?

## Options Considered

### Option A: Plain LangGraph

Build agent graphs directly using `StateGraph`, custom reducers, and LangChain tool nodes.

- Pros: Full control over graph structure; no opinionated middleware; no built-in overhead
- Cons: Requires manual implementation of filesystem middleware, permission rules,
  sub-agent routing, and todo list management. Line-count estimates: ~200–400 lines
  of infrastructure per experiment vs ~20–40 with DeepAgents (estimates — not measured).

### Option B: DeepAgents (current choice)

Use `createDeepAgent` as the harness for all experiments.

- Pros: FilesystemBackend, task tool, and middleware stack are pre-built and tested.
  Sub-agent dispatch (DDR-015) is a one-call operation. Context isolation (CIP) works
  out of the box via the task tool's filesystem-backed output pattern.
- Cons: Sub-agents do NOT inherit parent middleware — must inject explicitly per-run
  (DDR-013). Custom middleware requires non-obvious import path (`createMiddleware` from
  root `langchain`, not `langchain/agents`). Token overhead on first call is measurable
  (see evidence below).

## Decision

Use DeepAgents when ≥1 of the following holds:

1. **Multiple sub-agents** — `task` tool dispatch and the concurrent sub-agent reducer
   (T-DA-04 finding: sub-agents run in parallel by default) removes the need for custom
   routing and state-merging code (~40–80 lines removed; estimate).
2. **Filesystem isolation matters** — FilesystemBackend + permission rules (DDR-008)
   are a ~5-line setup. Equivalent isolation in plain LangGraph requires a custom
   middleware layer with path-matching logic (estimate: ~100 lines).
3. **Context isolation is the goal** — With the `task` tool + FilesystemBackend pattern,
   sub-agent output lands on disk; only a short completion token is added to the parent
   context. This achieves the CIP pattern (T-DA-04). Plain LangGraph can achieve the
   same effect with a custom sub-graph node that stores output to external state rather
   than returning it in the graph message stream, but requires explicit design.
4. **Harness experiments** — When the experiment is measuring DeepAgents behavior
   (T-DA-06, T-DA-07), DeepAgents is required by definition.

Use plain LangGraph when:

- The task is a single-agent pipeline with no filesystem needs and no sub-agents.
- Token cost is tightly budgeted and the first-call overhead (see evidence) exceeds budget.
- The middleware system would need more than 3 layers (complexity compounds quickly).

**Measured rule:** Cost per agent run ≈ Σ(fixed overhead + carried payload) per model
call. Delegation (CIP) pays off when: (a) the retrieval payload is large relative to the
fixed overhead per call, AND (b) post-retrieval work spans many model calls (so the
payload would compound into every subsequent call without delegation). At small corpus
sizes the overhead dominates; at 38.5KB corpus the gain was 0.33× on main-agent peak
tokens (T-DA-04 v2).

## Consequences

- What gets easier: sub-agent dispatch, permission rules, context isolation proof — all
  straightforward to implement with DeepAgents.
- What gets harder: custom middleware requires non-obvious import patterns; sub-agent
  middleware injection must be explicit (DDR-013); the `task` ToolMessage content depends
  on the sub-agent prompt design, not a fixed contract.
- Technical debt: DeepAgents 1.14.1 is pinned; if the API changes, all middleware files
  need updating. Mitigated by the pinned version in CLAUDE.md and PROGRESS.md.

## Empirical evidence

**First-call token overhead (T-DA-04 v1, measured):**

Config A (single agent, no delegation) call-1 input tokens: **4,210** (run 1–3 identical).
Config B (sub-agent delegation) call-1 input tokens: **4,485** (run 1–3 identical).
Both figures include the DeepAgents system prompt and tool schema on the first call.
(Source: `results/context-isolation/results.json`, `inputTokensPerCall[0]`.)

**Context isolation gain (T-DA-04):**

| Version | Corpus  | Median isolation ratio                  | Gate                   |
| ------- | ------- | --------------------------------------- | ---------------------- |
| v1      | ~20KB   | 0.5464 (A=11,228 / B=6,135 peak tokens) | FAIL (threshold ≤0.50) |
| v2      | ~38.5KB | 0.3286 (A=10,851 / B=3,566 peak tokens) | PASS                   |

3-run system cost totals (within each version, using `systemInputTokens`/`systemOutputTokens` × $0.75/$4.50 per 1M):

| Version             | Config A | Config B | B vs A |
| ------------------- | -------- | -------- | ------ |
| v1 (~20KB corpus)   | $0.1922  | $0.1849  | −3.8%  |
| v2 (~38.5KB corpus) | $0.1322  | $0.1320  | −0.2%  |

The JSON `estimatedCostUsd` field used per-agent `inputTokens` (~48K vs ~204K system tokens) and is not the correct cost basis.

B is marginally cheaper in both versions: sub-agents do focused retrieval rather than
carrying the full corpus in every main-agent call, but sub-agent overhead partially
offsets the saving. The cost advantage of delegation grows with corpus size.

**Sub-agent concurrency (T-DA-04 finding):** deepagents@1.14.1 dispatches parallel
`task` calls concurrently via a shared-state reducer. Confirmed from source:
`node_modules/deepagents/dist/langsmith-Bgi_Ta-k.js` line 1908.

**T-DA-04 worker return sizes:** T-DA-04 Config B workers returned 244–574 tokens per
worker summary into the main-agent context (3-run range; source: `workerReturnTokens`
in `results/context-isolation/results-v2.json`). This confirms the task ToolMessage
content is sub-agent-dependent, not a fixed "Task completed" string.

**Producer-Critic loop (T-DA-05 V2):** Supervisor + critic sub-agent via `task` tool.
System total (3 rounds): input 36,673 (supervisor) + critic tokens → **$0.0518**
($0.0359 supervisor + $0.0159 critic; source: `reports/T-DA-05-report.md` table).

## Changelog

- **2026-10-07 (initial):** Accepted with ~850/~55 overhead figure and "Task completed"
  generalization; used per-run T-DA-04 costs and T-DA-04 v2 ratio only.
- **2026-10-07 (revised):** Replaced unverified overhead figure with measured T-DA-04
  v1 call-1 values (4,210 / 4,485 tokens). Removed "Task completed" generalization —
  ToolMessage content is sub-agent-prompt-dependent. Added T-DA-04 v1 gate result
  (FAIL 0.5464) alongside v2 (PASS 0.3286). Replaced per-run T-DA-04 costs with 3-run
  totals. Replaced supervisor-only T-DA-05 cost ($0.036) with system total ($0.0518).
  Removed BGA counter from DeepAgents Pros (it is project code in `src/lib/counter.ts`,
  not a built-in DeepAgents feature). Labelled line-count comparisons as estimates.
  Softened "cannot be replicated" claim to describe the design effort required. Added
  measured cost rule.
- **2026-10-08 (revised):** Corrected cost pairing — v1 and v2 costs now shown
  within-version only (v1: A=$0.1922, B=$0.1849; v2: A=$0.1322, B=$0.1320).
  Removed the earlier mixed-version B figure ($0.1228) which came from the JSON
  `estimatedCostUsd` field (per-agent `inputTokens` only, not system totals).
