# DDR-009 — Benchmark Code-Execution Environment

**Date:** 2026-10-07
**Status:** Accepted
**Task:** T-DA-06

---

## Context

T-DA-06 measures five harness optimization patterns against a 20-problem
TypeScript algorithmic benchmark. To compute pass/fail the harness must execute
the model's output code against deterministic test cases.

Four options were evaluated:

1. **JS port of an existing benchmark (e.g., HumanEval-JS)** — ports exist but
   introduce an external dependency and coverage concerns around whether the
   port accurately reflects the original.
2. **Curated TS/JS subset** — hand-authored problems tuned to the project's
   measurement goals; no external deps.
3. **`new Function()`** — evaluates a code string in the current Node.js process.
4. **`node:vm`** — evaluates code in a lightweight sandbox (separate context).
5. **`child_process`** — spawns a new Node.js process for full isolation.

---

## Decision

### Problem set: curated JS subset

20 problems hand-authored in `benchmark/subset/problems.ts`. Each problem
specifies: description, function name, parameter names, and 4–5 test cases with
deterministic integer/array/boolean expected outputs.

**Why not HumanEval-JS:** Adds an external corpus dependency; problems are not
tailored to expose the specific failure modes the harness patterns target (edge
cases in DP, prefix sums, XOR, etc.).

**Why curated:** Problems can be selected and tuned based on observed baseline
failure rate. The selection criterion is: overall baseline pass rate must be
≤80% (≥4/20 problems fail on first run with gpt-5.4-mini). If baseline is
≥85%, harder problems are substituted.

**Model used for selection:** `gpt-5.4-mini-2026-03-17` (the project's primary
model since T-DA-04). The original tasks.md said "Gemini Flash" as the baseline
model, but the model was migrated before T-DA-06. The selection criterion is
unchanged in spirit — baseline must show meaningful failure rate.

### Temperature: 0.7

Initial runs at `temperature=0` produced 100% pass rate on all 20 standard
LeetCode-style problems. `gpt-5.4-mini` has memorized these problems at greedy
decoding — the baseline provides no signal for comparing harness patterns.

**Fix applied:**

1. Replaced 5 easy canonical problems (twoSum, missingNumber, majorityElement,
   hammingWeight, singleNumber) with harder non-standard problems: numDecodings,
   jump-game-ii (min jumps), minWindow (minimum window substring),
   partitionLabels, and findAnagrams.
2. Set `temperature=0.7` to introduce generation variance — at temperature=0
   even harder problems that the model "knows" will be solved deterministically
   every run, compressing the pass-rate distribution and making harness
   differences invisible.

**Why 0.7 (not 1.0 or 0.5):** OpenAI documentation recommends 0.7–1.0 for
creative or exploratory tasks. 0.7 gives meaningful variance without making
outputs incoherent. The goal is a baseline pass rate in the 50–80% range so
harness patterns have room to move the needle in both directions.

**Consequence:** Results are non-deterministic across runs; the experiment runs
3 times per step to get an average, matching [[DDR-005]] methodology.

**Verification (2026-10-07):** 5 calls to minWindow at temperature=0.7 produced 5 distinct
output hashes (dec74ac77585, 6ebc93ed269f, d84fd010e63f, 43c68a767dca, f47e0de4da7f).
Temperature is accepted by the provider and effective. Despite this, corrected baseline
pass rate is 100.0% — temperature variance does not produce failures for this problem set.

### Execution: `new Function()`

```typescript
const fn = new Function(...paramNames, code);
const result = fn(...testCaseInputs);
```

**Why not `node:vm`:** Adds complexity (context creation, `vm.Script`) without
material safety benefit for controlled LLM output in a local experiment.
`node:vm` does not provide OS-level isolation — it shares the same process
memory and can be escaped. The safety delta over `new Function()` is negligible
for this use case.

**Why not `child_process`:** Each test case would require spawning a new process
or serialising state, adding ~100–300ms latency per call. With 20 problems × 4
test cases per problem × 300 runs this would add 24–72 seconds of pure spawn
overhead. Not worth it for a controlled benchmark with no network/filesystem
calls.

**Why `new Function()` is acceptable:** The model outputs are code for known
algorithmic problems with no system calls, no require/import, and no async I/O.
The threat model (model outputs hostile code) is low for a benchmark setting.
If this harness were deployed in an untrusted environment, `node:vm` or a
subprocess sandbox would be required.

**Safety note — input isolation:** Inputs are deep-cloned via `JSON.parse(JSON.stringify(...))`
before passing to the function, so in-place mutations in one test case do not
affect subsequent ones (e.g., `rotate` modifies the array in-place).

**Security risk — in-process execution:** `new Function()` runs model-generated code in the same
Node.js process with no isolation. Specific risks:

- **`process.env` access** — code can read any environment variable, including `OPENAI_API_KEY`,
  `LANGSMITH_API_KEY`, etc.
- **No timeout** — an infinite loop (`while(true){}`) hangs the entire process.
- **Global scope access** — `require`, `fetch`, and Node.js built-ins are accessible depending
  on how globals are configured.
- **No memory limit** — a memory-exhausting loop can OOM the process.

These risks are acceptable for the current use case (20 known algorithmic problems, local
experiment, no secret env vars at risk beyond API keys that are already trusted). They are
**not acceptable** for untrusted problem specs or user-submitted code.

**Mitigation planned for v2:** Execute model code in a `child_process.exec()` call with:

- `env: {}` — no inherited environment variables
- `timeout: 5000` — kill after 5 seconds
- `--max-old-space-size=256` — memory cap
- Separate problem-runner script receiving code via stdin (no shared process state)

---

## Consequences

- No new npm packages needed for code execution.
- The checker is synchronous and O(test_cases) per problem.
- `deepEqual` handles arrays and nested objects; no third-party assertion library.
- Problems with in-place mutation (`rotate`) are handled by the clone step.

---

## References

- [[DDR-005]] — Measurement Discipline (sequential runs, cost accounting)
- [[DDR-012]] — Model switch to gpt-5.4-mini (replaces Gemini Flash baseline)
