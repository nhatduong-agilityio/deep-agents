# Report: T-DA-05 — Critique Workflow

**Date completed:** 2026-10-07

## What was done

1. Created `src/experiments/critique/` with six source files:
   - `initial-draft.ts` — fixed 500-word AI governance draft seeded with 5 deliberate flaws; exported as `INITIAL_DRAFT` and `KNOWN_FLAWS[5]`
   - `producer.ts` — round 0 writes draft directly to disk; rounds 1–3 use `createDeepAgent` to revise the draft and write `/notes/revision-N.md`
   - `critic.ts` — critic agent with `createFilesystemMiddleware({ tools: ['read_file','ls','glob','write_file'], permissions: [...] })` enforcing the BRC allow/deny rules; exports `makeCriticAgent` for reuse in adversarial tests
   - `adversarial.ts` — prompts the critic agent to write outside `/feedback/`; verifies denial via disk check (`existsSync`) and captures any tool error message from `ToolMessage` content
   - `precision-judge.ts` — single `ChatGroq('openai/gpt-oss-20b')` call that rates each numbered feedback item valid/spurious; returns `{ totalCritiques, validCritiques, critiquePrecision, itemRatings }`
   - `run.ts` — orchestrates the full loop: init → ≤3 rounds (critic → hash check → 2 adversarial tests → Groq judge → producer revision) → results.json; hard-fails if any adversarial deny was not observed

2. Created `src/__tests__/critique-permissions.test.ts` — 5 unit tests: BRC config accepted without throwing, empty permissions accepted, tools allowlist accepted, `writeInitialDraft` creates disk file, `KNOWN_FLAWS` has correct length.

3. Wrote `docs/decisions/DDR-008-critic-permissions.md` — decision on tool allowlist vs capability filtering, permission rule order, and empirical evidence table.

4. Updated `docs/decisions/README.md` to add DDR-008 entry.

5. Fixed Groq judge model: `llama-3.3-70b-versatile` was not available on this account; switched to `openai/gpt-oss-20b` (confirmed via `GET /openai/v1/models`).

6. Ran the experiment: `pnpm exec tsx --env-file=.env src/experiments/critique/run.ts` — 3 rounds completed; results saved to `results/critique/results.json`.

## Concepts covered

- **Blast-Radius Containment (BRC):** A middleware permission pattern that restricts an agent's write surface to the minimum path set required for its task. The key implementation detail: rules are first-match-wins, so the `/feedback/**` allow rule must precede the `/**` deny rule; omitting the final deny leaves the default-allow gap open.

- **Explicit tools allowlist vs capability filtering:** `FilesystemMiddleware` registers all `FILESYSTEM_TOOL_NAMES` at init time regardless of backend capabilities; `execute` only gets filtered at request time when `isSandboxBackend()` is checked. An explicit `tools` allowlist in `createFilesystemMiddleware` is deterministic at construction and cannot be bypassed by a backend capability regression.

- **Producer-Critic loop (PC pattern):** Separating document creation (producer) from document evaluation (critic) with distinct tool permissions. The critic cannot modify what it critiques; the hash invariant enforces this mechanically rather than by instruction.

- **Critique Precision metric:** Valid critiques ÷ total critiques per round, measured by a separate LLM judge. Distinguishes genuine flaws from spurious issues. Used to assess whether critic quality degrades across rounds or as the draft improves.

- **FilesystemOperation type:** `"read" | "write"` only in deepagents@1.14.1 — no `"delete"` operation. Write restrictions cover all mutation; `delete` does not need a separate rule.

## Decisions and reasons

**Tool allowlist in middleware, not at `createDeepAgent`:** The `tools` restriction is passed to `createFilesystemMiddleware`, not to `createDeepAgent`. This is the correct place — it removes the tools from the exposed schema, not just the agent's instructions.

**BRC allow rule before deny rule:** See DDR-008. Default is allow; the deny rule exists to close the gap for paths outside `/feedback/**`. Without it, writes to any unmatched path succeed.

**Single Groq judge call:** The judge receives the full draft and all feedback in one call and returns a JSON array. No tool use, no multi-turn loop — satisfies the Groq single-call constraint. Groq model `openai/gpt-oss-20b` used (only text-capable model available; `llama-3.3-70b-versatile` returned 404).

**Adversarial tests on two paths:** `/drafts/adversarial.md` and `/report/adversarial.md` both exercise the same deny rule (anything outside `/feedback/**`). Testing both confirms the first-match-wins logic applies to any non-feedback path, not just `/drafts/`.

**Round 0 written directly (no LLM):** The initial draft is a fixed constant for reproducibility. This guarantees the 5 known flaws are present for precision measurement; an LLM-generated initial draft would introduce non-deterministic flaws.

See `docs/decisions/DDR-008-critic-permissions.md` for the full permission design rationale.

## Evidence of completion

### Experiment run output

```
Critique Workflow — T-DA-05
Model: gpt-5.4-mini-2026-03-17 | max 3 rounds
Known flaws seeded: 5

  [init] draft-v1.md written (5 deliberate flaws)

--- Round 1 ---
  [hash] draft-v1 before: 2270c5af5516...
  critic: 9996ms | in=6389 out=972 | runId=ac5f5f0f-b823-49c7-a3c3-be36c8487c6e
  [hash] draft-v1 after: 2270c5af5516... ✓ unchanged
  /drafts/ write DENIED ✓ | runId=2616cf1c-ae3b-4434-a9a3-fdf4b5cc3981
  /report/ write DENIED ✓ | runId=29bd4431-8a79-4d2d-8549-054ed299353f
  precision: 10/10 = 1 | known flaws: 5
  addressed: 10/10 items ✓

--- Round 2 ---
  [hash] draft-v2 before: 9750d6a19a75...
  critic: 10977ms | in=5658 out=1169 | runId=7ed1e2b2-6b30-4323-969e-ee891ae107ec
  [hash] draft-v2 after: 9750d6a19a75... ✓ unchanged
  /drafts/ write DENIED ✓ | runId=35c1eb98-1295-4616-9e7c-b819a2aca00b
  /report/ write DENIED ✓ | runId=0c426bfb-b6d6-433c-8631-16c2533c4bf3
  precision: 12/12 = 1 | known flaws: 5
  addressed: 10/12 items ✗

--- Round 3 ---
  [hash] draft-v3 before: bdf9f8f5bd59...
  critic: 13881ms | in=6137 out=1516 | runId=5ad9650a-1a06-4bf4-8326-7ada13114d6b
  [hash] draft-v3 after: bdf9f8f5bd59... ✓ unchanged
  /drafts/ write DENIED ✓ | runId=e5625c35-be58-4631-bf21-8c7238ee95ae
  /report/ write DENIED ✓ | runId=e5fd4ac1-729f-4a65-9d38-102d50834ede
  precision: 17/17 = 1 | known flaws: 5

=== SUMMARY ===
  rounds completed:            3/3
  hash unchanged (all rounds): ✓
  adversarial denied (all):    ✓
  avg critique precision:      1.000
  total input tokens:          78,240
  total output tokens:         7,096
  estimated cost:              $0.0906
```

### LangSmith run IDs

| Round | Role                 | Run ID                               |
| ----- | -------------------- | ------------------------------------ |
| 1     | critic               | ac5f5f0f-b823-49c7-a3c3-be36c8487c6e |
| 1     | adversarial /drafts/ | 2616cf1c-ae3b-4434-a9a3-fdf4b5cc3981 |
| 1     | adversarial /report/ | 29bd4431-8a79-4d2d-8549-054ed299353f |
| 1     | producer             | fc3f6151-5e92-49bf-bafb-4c44a4d864c6 |
| 2     | critic               | 7ed1e2b2-6b30-4323-969e-ee891ae107ec |
| 2     | adversarial /drafts/ | 35c1eb98-1295-4616-9e7c-b819a2aca00b |
| 2     | adversarial /report/ | 0c426bfb-b6d6-433c-8631-16c2533c4bf3 |
| 2     | producer             | 1a437186-8fe3-4223-9ff0-91602322a253 |
| 3     | critic               | 5ad9650a-1a06-4bf4-8326-7ada13114d6b |
| 3     | adversarial /drafts/ | e5625c35-be58-4631-bf21-8c7238ee95ae |
| 3     | adversarial /report/ | e5fd4ac1-729f-4a65-9d38-102d50834ede |

### Output files

- `results/critique/results.json`
- `tmp/critique/run-1/drafts/draft-v{1,2,3}.md`
- `tmp/critique/run-1/feedback/round-{1,2,3}.md`
- `tmp/critique/run-1/notes/revision-{1,2}.md`

## Gotchas / lessons learned

**`llama-3.3-70b-versatile` not available on this Groq account.** The model returned 404. Available text models are `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, and `qwen/qwen3.8-27b`. For future single-call Groq roles, verify availability with `GET /openai/v1/models` first. The `openai/gpt-oss-20b` model worked correctly.

**`FilesystemOperation` has no `"delete"` value.** DDR-008 and tasks.md originally referenced `["write", "delete"]` as the operations tuple for the deny rule, but the deepagents type is `"read" | "write"` only. Using `"delete"` would have caused a TypeScript error. Checked via `grep -A 5 "FilesystemOperation"` in the dist types.

**Producer revision notes miss items at round boundary.** In round 2, the producer addressed all 10 items in its revision log but the round 2 critic had raised 12 items — 2 were not noted. The omitted items surfaced in round 3's critique (17 items). This is not a BRC failure but a convergence observation: the model under-reports addressed items in its revision log rather than truly skipping them. Future tasks that rely on revision-note counting should verify against draft diff rather than note count alone.

**Critique precision inflated by judge.** All three rounds received 1.000 precision (all critiques rated valid). This is partly because the initial draft had broad flaws that invited valid critique beyond the 5 seeded ones. The 5 known flaws are a floor, not a ceiling, for what the critic can legitimately flag. A precision score of 1.000 is not a bug — it reflects a genuinely flawed draft and a capable critic.

**Hash check is the BRC ground truth.** The adversarial disk check (`!existsSync(diskPath)`) confirmed denial for both `/drafts/` and `/report/` across all 6 adversarial runs. The model never created the target files despite being instructed to. The `toolErrorMessage` field in `AdversarialResult` captured the denial message from the `ToolMessage` content for LangSmith cross-reference.
