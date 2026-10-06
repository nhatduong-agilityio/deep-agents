# DDR-010: CIP Isolation Benefit Scales with Retrieval Payload Relative to Fixed Harness Overhead

**Date:** 2026-10-06
**Status:** Hypothesis (not yet tested)
**Related:** DDR-006 (FilesystemBackend), DDR-013 (RC1/RC2 fix), T-DA-04 report

## Finding: floor and growth from T-DA-04

T-DA-04 measured context isolation with a 6-file AI-regulation corpus (~50KB, EU AI Act + US EO).
The primary isolation gate (Config B main-agent peak / Config A main-agent peak ≤ 0.50) **failed
at 0.5464**. Secondary analysis reveals why:

### Fixed overhead floor

| Metric                                      | Value     |
| ------------------------------------------- | --------- |
| Config A call-1 tokens (system prompt only) | 4,210     |
| Config B call-1 tokens (supervisor prompt)  | 4,485     |
| B floor / A median peak (11,228)            | **39.9%** |

B's supervisor prompt alone is already 40% of A's median peak. Even if corpus delegation were
perfect (workers return 0 tokens), B could not go below ~40% with this corpus size.

### Growth comparison

| Config | Median growth (peak − call-1)             | Median growth ratio B/A |
| ------ | ----------------------------------------- | ----------------------- |
| A      | 7,018 tokens (corpus reads)               | —                       |
| B      | 1,650 tokens (task returns + write_files) | **0.235**               |

B's context grows only 23.5% as fast as A's. The gate fails not because the delegation is
ineffective, but because the fixed overhead floor (4485 / 11228 = 39.9%) leaves only ~10%
of headroom for B to clear 50%.

### System cost — corpus carry mechanism

Cost is proportional to (corpus tokens) × (number of model calls that carry them). In A, corpus
tokens enter the rolling context after the read calls and persist through every subsequent call.
In B, corpus tokens appear only in worker spans.

| Config               | Corpus tokens | Calls carrying | Corpus carry       |
| -------------------- | ------------- | -------------- | ------------------ |
| A run 1              | 6,023         | 6              | 36,138             |
| A run 2              | 6,023         | 6              | 36,138             |
| A run 3              | 6,023         | 7              | 42,161             |
| B EU worker × 3 runs | 3,899         | 2 each         | 7,798 × 3 = 23,394 |
| B US worker × 3 runs | 2,146         | 2 each         | 4,292 × 3 = 12,876 |
| **A total**          |               |                | **114,437**        |
| **B total**          |               |                | **36,270**         |

**Corpus carry ratio B/A: 0.317** — B's corpus carry is ~32% of A's.

| Config | Total system input | Total estimated cost |
| ------ | ------------------ | -------------------- |
| A      | 236,077 tokens     | $0.1922              |
| B      | 204,608 tokens     | **$0.1849**          |

B saves 78,167 corpus-carry tokens vs A. B spends 46,698 more non-corpus tokens (sub-agent
overhead) and generates 3,633 more output tokens. Net savings: $0.0073, dominated by corpus carry.

## Scaling hypothesis

**Claim:** As corpus size grows, A's peak grows roughly proportionally to corpus size (all corpus
content enters the main agent's context). B's floor stays fixed (~4,485 tokens) and B's growth
grows only with summary size (bounded by the word cap). The isolation ratio improves as corpus
size increases.

Formal model (for a corpus of size C bytes):

```
A peak ≈ overhead_A + C/bytes_per_token
B peak ≈ overhead_B + n_workers × summary_tokens_per_worker
```

where `overhead_A ≈ 4210`, `overhead_B ≈ 4485`, `bytes_per_token ≈ 4`.

Gate condition: B_peak / A_peak ≤ 0.50

```
(4485 + n × s) / (4210 + C/4) ≤ 0.50
```

For the current experiment: C = ~50,000 bytes, n=2, s≈200 → ratio ≈ 5075/16710 = 0.304.
But this ignores write_file and write_todos overhead (~1200 tokens), giving actual B ≈ 6300,
A ≈ 16710 → ratio ≈ 0.377. The measured ratio (0.546) is higher because A's corpus adds
~6,000 tokens to the _first read call_ which then persists through all subsequent calls —
the corpus is in the rolling message history, not a one-time cost.

**Revised model (rolling context):**

```
A peak ≈ overhead_A + (6 files × avg_file_tokens) + writing_overhead
B peak ≈ overhead_B + 2 × summary_tokens + writing_overhead
```

Current values: overhead_A=4210, corpus_tokens≈6123, writing=800 → A_peak≈11133 ✓
overhead_B=4485, summaries≈584, writing=1066 → B_peak≈6135 ✓

Gate crosses 0.50 when: A_peak ≥ 2 × B_peak
With B_peak fixed at ~6300: A_peak must be ≥ 12,600.
That requires corpus_tokens ≥ 12,600 − 4210 − 800 = 7,590 tokens ≈ 30KB additional corpus.
Total corpus ≥ ~80KB would be sufficient (from current ~50KB).

## Proposed follow-up (pre-registered, not yet run)

**Experiment T-DA-04b** (proposed, optional, not scheduled):

### Quantitative prediction

Corpus calibration from T-DA-04: 28,803 bytes / 6,023 tokens = 4.78 bytes/token measured.
Assumption used below: 4 chars/token (standard approximation; conservative vs. measured 4.78).

At ~150KB corpus:

```
corpus_tokens = 150,000 / 4 = 37,500 tokens
A peak ≈ 4,210 (call-1) + 37,500 (corpus) + ~1,500 (writing overhead) = ~43,210 tokens
B peak ≈ 4,485 (supervisor) + 2 × ~584 (summaries) + ~447 (writing) ≈ 6,100 tokens
  (B supervisor prompt is fixed; worker summaries bounded by 150-word cap → ~584 tokens each)
predicted ratio = 6,100 / 43,210 = 0.141 ≈ 0.14
```

**Gate passes comfortably** — 0.14 << 0.50.

### Falsification criterion

The prediction is falsified if **B peak grows with corpus size** (indicating corpus tokens are
leaking into the main agent's context, violating the isolation invariant). Specifically:

- B main-agent peak ≥ B_current × (new_corpus_tokens / current_corpus_tokens) ≡ corpus leak confirmed
- Any B main-agent peak > 10,000 at 150KB corpus would be anomalous and require investigation

### Procedure

1. Expand corpus to ~150KB (add EU AI Act full text or similar)
2. Keep all other parameters identical (same model, same configs, same 3-pair measurement)
3. Report: isolation ratio, floor, growth ratio, system cost A vs B

This experiment would test whether the 0.50 gate is achievable with this architecture and whether
cost-neutrality holds at larger corpus sizes (expected: yes, B remains cheaper because worker
contexts are bounded by summary cap, not corpus size).

## Implication for CIP design

The Context Isolate Pattern delivers measurable isolation (46% reduction in peak context), but
the threshold at which it clearly passes a ≤50% gate depends on:

1. Corpus retrieval payload size (drives A's growth)
2. Supervisor prompt size (drives B's floor)
3. Worker summary cap (drives B's growth)

For small corpora (~50KB), the supervisor prompt overhead dominates and the gate is marginal.
For larger corpora (≥80KB with current overhead), the gate should pass comfortably.

Design recommendation: when corpus size is unknown or small, gate on growth ratio (B/A ≤ 0.30)
rather than peak ratio — this is a more stable metric that is not sensitive to supervisor prompt
length relative to corpus size.
