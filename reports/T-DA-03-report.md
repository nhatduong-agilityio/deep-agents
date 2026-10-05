# Report: T-DA-03 — Artifact Agent (Output 1)

**Date completed:** 2026-10-05

## What was done

- Created `corpus/` directory with 6 AI-regulation source documents:
  - `eu-ai-act-article-5.txt` — prohibited AI practices (EU AI Act, Article 5)
  - `eu-ai-act-article-9.txt` — risk management system (EU AI Act, Article 9)
  - `eu-ai-act-article-13.txt` — transparency obligations (EU AI Act, Article 13)
  - `eu-ai-act-annex-iii.txt` — high-risk AI systems list (EU AI Act, Annex III)
  - `us-eo-14110-section-4.txt` — safe/secure/trustworthy AI (EO 14110, Section 4)
  - `us-eo-14110-section-9.txt` — privacy and civil liberties (EO 14110, Section 9)

- Created `src/experiments/artifact-agent/agent.ts` — exports `runArtifactRun(n, checkerFn)`:
  - Copies `corpus/` into `tmp/artifact-agent/run-{n}/corpus/` before invoke so `virtualMode:true` serves them at `/corpus/`
  - Task prompt instructs the agent to read all corpus files, write ≥3 findings with `Source: <filename>` citations, a summary, and a sources list
  - Preserves `workDir` after each run (not deleted) so the checker and T-DA-04 can verify the files
  - Records `inputTokens`, `outputTokens`, `modelCallCount`, `elapsedMs`, `estimatedCostUsd`

- Created `src/scripts/check-report.ts` — deterministic CLI checker:
  - Verifies `{reportDir}/report/summary.md` exists and is non-empty
  - Verifies `{reportDir}/report/findings/` has ≥3 `.md` files
  - Verifies `{reportDir}/report/sources.md` exists and is non-empty
  - For each finding: checks it contains a `Source:` line naming a real corpus file
  - Exits 0 on full pass, 1 on any failure; guarded with `isDirectRun` check so it can be imported without side effects

- Created `src/experiments/artifact-agent/run.ts` — orchestrates 3 runs with 65 s inter-run pacing; calls checker after each run; saves `results/artifact-agent/results.json`.

- Ran experiment: 3 runs completed, all checker-passing.

- Created `docs/decisions/DDR-006-filesystem-backend.md`; updated `docs/decisions/README.md` index.

## Concepts covered

- **Filesystem as Context (FSC):** Large payloads (corpus documents) are written to disk; only file paths appear in agent messages. This keeps the context window small — the model never re-serialises the full corpus text on every step, only the path to a file it already read. Applied here via `FilesystemBackend` with `virtualMode: true`.

- **FilesystemBackend `virtualMode: true`:** Remaps all agent-facing paths under `rootDir`. The agent's `/corpus/eu-ai-act-article-5.txt` resolves to `tmp/artifact-agent/run-{n}/corpus/eu-ai-act-article-5.txt` on real disk. Without `virtualMode`, absolute paths like `/corpus/` resolve to the filesystem root and cause ENOENT errors (same failure mode as T-DA-02 stray files).

- **Corpus copy per run:** Because `virtualMode` scopes everything under `rootDir`, the corpus must be copied into each run's `workDir/corpus/` before invoke. The project-level `corpus/` is the source of truth; the per-run copy is the agent's sandbox.

- **Deterministic checker (no LLM judge):** `check-report.ts` verifies file structure and citation presence using `existsSync`, `readdirSync`, and a regex for `Source: <filename>`. It produces a binary pass/fail with itemised output — no model call required. This makes the check fast, reproducible, and cost-free.

- **CLI guard pattern:** The checker exports `checkReport()` as a named function and guards the CLI entrypoint with `process.argv[1]?.endsWith('check-report.ts')`. This allows `run.ts` to import and call `checkReport()` programmatically without triggering the CLI exit path.

## Decisions and reasons

- **`FilesystemBackend` over `StateBackend`:** `StateBackend` would serialise all corpus content into the LangGraph state dict and inject it on every model step, violating the FSC pattern. `FilesystemBackend` keeps only paths in messages. See DDR-006 (`docs/decisions/DDR-006-filesystem-backend.md`) for the full option analysis.

- **`virtualMode: true` always:** Established in T-DA-02 as the safe default — prevents agent writes from escaping the project. Applied consistently here.

- **Preserve workDir after run:** Unlike T-DA-02 (cleanup after each run), T-DA-03 keeps `workDir` intact. The checker needs the files immediately, and T-DA-04 (context isolation) will reuse the same report outputs as a quality gate.

- **`isDirectRun` guard on CLI entrypoint:** Module-level side-effects in a shared script cause it to `process.exit(1)` when imported. Guarding with an `argv[1]` suffix check is simpler than the ESM `import.meta.url === fileURLToPath(process.argv[1])` pattern and works correctly with tsx.

## Evidence of completion

```
Artifact Agent — T-DA-03
Model: gemini-3.5-flash-lite | 3 runs

  running run 1/3...
  PASS: /report/summary.md exists and is non-empty
  PASS: /report/sources.md exists and is non-empty
  PASS: /report/findings/ has 3 .md file(s)
  PASS: finding-1.md cites "eu-ai-act-article-5.txt"
  PASS: finding-2.md cites "eu-ai-act-article-9.txt"
  PASS: finding-3.md cites "us-eo-14110-section-4.txt"
  [✓] run  1 | findings=3 | in=33435 out=1628 | calls=4 | 10786ms
  [rate-limit] waiting 65s...
  running run 2/3...
  [✓] run  2 | findings=3 | in=80691 out=1712 | calls=8 | 13538ms
  [rate-limit] waiting 65s...
  running run 3/3...
  [✓] run  3 | findings=3 | in=42257 out=1692 | calls=5 | 10655ms

=== SUMMARY ===
  checker pass rate: 3/3
  avg total tokens/run: 53805
  avg model calls/run:  6
  total estimated cost: $0.0132

Results saved to results/artifact-agent/results.json
```

- `results/artifact-agent/results.json` — 3 run records, all `checkerPassed: true`, all `findingCount: 3`
- Report files written to `tmp/artifact-agent/run-{1,2,3}/report/` (preserved for T-DA-04)
- LangSmith traces: auto-traced under project `deep-agents-phase`; `deepagents_version: 1.14.1`, `model_id: gemini-3.5-flash-lite` in metadata on every run

## Gotchas / lessons learned

- **CLI entrypoint fires on import:** A module with top-level `process.exit()` calls will terminate the importing process. Always guard CLI entrypoints with `process.argv[1]?.endsWith(filename)` when the same module exports library functions.

- **Corpus must live inside workDir for virtualMode:** `virtualMode: true` scopes ALL paths under `rootDir`. If you give the agent `/corpus/file.txt` and the corpus is only at the project root, the agent gets ENOENT. Copy corpus into `workDir/corpus/` before invoke.

- **Token variance is high across runs (33 K–81 K):** The agent non-deterministically decides how many intermediate steps to take before writing findings. Run 2 used 8 model calls vs run 1's 4. The FSC pattern bounds per-step token growth but doesn't control step count. Rate-limit pacing (65 s inter-run) handles this safely.

- **`pnpm dev` only runs `src/index.ts`:** The `dev` script hardcodes `src/index.ts` as the entrypoint — it does not accept a file argument. Use `npx tsx --env-file=.env <script>` to run experiment scripts directly.
