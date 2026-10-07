import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_MODEL_CONFIG } from '../artifact-agent/agent.js';
import { runAdversarialTest, type AdversarialResult } from './adversarial.js';
import { runCritic, type CriticResult } from './critic.js';
import { KNOWN_FLAWS } from './initial-draft.js';
import { judgeRound, type JudgeResult } from './precision-judge.js';
import { runProducer, writeInitialDraft, type ProducerResult } from './producer.js';

const WORKSPACE_ROOT = join(process.cwd(), 'tmp', 'critique');
const RESULTS_DIR = join(process.cwd(), 'results', 'critique');
const MAX_ROUNDS = 3;
// 5 s between agent invocations to respect OpenAI Tier-1 rate limits
const INTER_CALL_DELAY_MS = 5_000;

interface RoundResult {
  round: number;
  draftVersion: number;
  draftHashBefore: string;
  draftHashAfter: string;
  hashUnchanged: boolean;
  critic: CriticResult;
  adversarialDrafts: AdversarialResult;
  adversarialReport: AdversarialResult;
  judge: JudgeResult;
  producer: ProducerResult | null; // null on final round
  feedbackAddressed: boolean;
  feedbackItemCount: number;
  addressedItemCount: number;
}

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, INTER_CALL_DELAY_MS));
}

function hashDisk(workDir: string, virtualPath: string): string {
  const diskPath = join(workDir, virtualPath.replace(/^\//, ''));
  return createHash('sha256').update(readFileSync(diskPath)).digest('hex');
}

// Count numbered items in a feedback file (lines starting with "1." or "1:")
function countFeedbackItems(text: string): number {
  return (text.match(/^\d+[.:]/gm) ?? []).length;
}

// Count addressed items in a revision notes file (lines starting with "Item N:")
function countAddressedItems(text: string): number {
  return (text.match(/^Item \d+:/gim) ?? []).length;
}

function readVirtual(workDir: string, virtualPath: string): string {
  const p = join(workDir, virtualPath.replace(/^\//, ''));
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

async function main(): Promise<void> {
  const workDir = join(WORKSPACE_ROOT, 'run-1');
  mkdirSync(workDir, { recursive: true });
  mkdirSync(RESULTS_DIR, { recursive: true });

  const modelConfig = DEFAULT_MODEL_CONFIG;

  process.stdout.write(`Critique Workflow — T-DA-05\n`);
  process.stdout.write(`Model: ${modelConfig.modelId} | max ${MAX_ROUNDS} rounds\n`);
  process.stdout.write(`Known flaws seeded: ${KNOWN_FLAWS.length}\n\n`);

  // Round 0: write fixed flawed draft — no LLM call.
  writeInitialDraft(workDir);
  process.stdout.write(`  [init] draft-v1.md written (${KNOWN_FLAWS.length} deliberate flaws)\n`);

  const rounds: RoundResult[] = [];
  let currentDraftVersion = 1;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    process.stdout.write(`\n--- Round ${round} ---\n`);

    const draftVPath = `/drafts/draft-v${currentDraftVersion}.md`;
    const feedbackVPath = `/feedback/round-${round}.md`;

    // Hash before critic run
    const draftHashBefore = hashDisk(workDir, draftVPath);
    process.stdout.write(
      `  [hash] draft-v${currentDraftVersion} before: ${draftHashBefore.slice(0, 12)}...\n`,
    );

    // Critic run
    process.stdout.write(
      `  [critic] round ${round} — reading draft-v${currentDraftVersion}, writing feedback/round-${round}...\n`,
    );
    await pause();
    const critic = await runCritic(workDir, currentDraftVersion, round, modelConfig);
    totalInputTokens += critic.inputTokens;
    totalOutputTokens += critic.outputTokens;
    process.stdout.write(
      `    critic: ${critic.elapsedMs}ms | in=${critic.inputTokens} out=${critic.outputTokens} | runId=${critic.langsmithRunId}\n`,
    );

    // Hash after critic run — must be unchanged
    const draftHashAfter = hashDisk(workDir, draftVPath);
    const hashUnchanged = draftHashBefore === draftHashAfter;
    process.stdout.write(
      `  [hash] draft-v${currentDraftVersion} after: ${draftHashAfter.slice(0, 12)}... ${hashUnchanged ? '✓ unchanged' : '✗ MODIFIED'}\n`,
    );

    // Adversarial test 1: attempt write to /drafts/
    process.stdout.write(`  [adversarial] attempting write to /drafts/adversarial.md...\n`);
    await pause();
    const adversarialDrafts = await runAdversarialTest(
      workDir,
      '/drafts/adversarial.md',
      modelConfig,
    );
    totalInputTokens += adversarialDrafts.inputTokens;
    totalOutputTokens += adversarialDrafts.outputTokens;
    process.stdout.write(
      `    /drafts/ write: attempted=${adversarialDrafts.writeAttempted} ` +
        `${adversarialDrafts.denied ? 'DENIED ✓' : adversarialDrafts.writeAttempted ? 'PERMITTED ✗' : 'PROMPT-REFUSAL (not enforcement) ✗'} ` +
        `| disk absent=${adversarialDrafts.fileAbsentOnDisk} | runId=${adversarialDrafts.langsmithRunId}\n`,
    );

    // Adversarial test 2: attempt write to /report/
    process.stdout.write(`  [adversarial] attempting write to /report/adversarial.md...\n`);
    await pause();
    const adversarialReport = await runAdversarialTest(
      workDir,
      '/report/adversarial.md',
      modelConfig,
    );
    totalInputTokens += adversarialReport.inputTokens;
    totalOutputTokens += adversarialReport.outputTokens;
    process.stdout.write(
      `    /report/ write: attempted=${adversarialReport.writeAttempted} ` +
        `${adversarialReport.denied ? 'DENIED ✓' : adversarialReport.writeAttempted ? 'PERMITTED ✗' : 'PROMPT-REFUSAL (not enforcement) ✗'} ` +
        `| disk absent=${adversarialReport.fileAbsentOnDisk} | runId=${adversarialReport.langsmithRunId}\n`,
    );

    // Read feedback and judge precision
    const feedbackText = readVirtual(workDir, feedbackVPath);
    const feedbackItemCount = countFeedbackItems(feedbackText);
    process.stdout.write(
      `  [judge] feedback has ${feedbackItemCount} item(s) — calling Groq precision judge...\n`,
    );

    const draftText = readVirtual(workDir, draftVPath);
    const judge = await judgeRound(draftText, feedbackText);
    process.stdout.write(
      `    precision: ${judge.validCritiques}/${judge.totalCritiques} = ${judge.critiquePrecision} | ` +
        `known flaws: ${KNOWN_FLAWS.length}\n`,
    );

    // Producer revision — skip on final round
    let producer: ProducerResult | null = null;
    let feedbackAddressed = false;
    let addressedItemCount = 0;

    if (round < MAX_ROUNDS && feedbackItemCount > 0) {
      const nextVersion = currentDraftVersion + 1;
      process.stdout.write(`  [producer] revision ${round} — writing draft-v${nextVersion}...\n`);
      await pause();
      producer = await runProducer(workDir, round, nextVersion, modelConfig);
      totalInputTokens += producer.inputTokens;
      totalOutputTokens += producer.outputTokens;
      process.stdout.write(
        `    producer: ${producer.elapsedMs}ms | in=${producer.inputTokens} out=${producer.outputTokens} | runId=${producer.langsmithRunId}\n`,
      );

      const revisionText = readVirtual(workDir, `/notes/revision-${round}.md`);
      addressedItemCount = countAddressedItems(revisionText);
      feedbackAddressed = addressedItemCount >= feedbackItemCount;
      process.stdout.write(
        `    addressed: ${addressedItemCount}/${feedbackItemCount} items ${feedbackAddressed ? '✓' : '✗'}\n`,
      );
      currentDraftVersion = nextVersion;
    } else {
      // Final round: verify via revision notes from the last producer run
      if (round > 1) {
        const revisionText = readVirtual(workDir, `/notes/revision-${round - 1}.md`);
        addressedItemCount = countAddressedItems(revisionText);
        feedbackAddressed = addressedItemCount >= feedbackItemCount;
      }
    }

    rounds.push({
      round,
      draftVersion: currentDraftVersion,
      draftHashBefore,
      draftHashAfter,
      hashUnchanged,
      critic,
      adversarialDrafts,
      adversarialReport,
      judge,
      producer,
      feedbackAddressed,
      feedbackItemCount,
      addressedItemCount,
    });

    // Stop early if critic found nothing more to improve
    if (feedbackItemCount === 0) {
      process.stdout.write(`  [done] no feedback items — stopping at round ${round}\n`);
      break;
    }
  }

  // Summary
  const allHashesUnchanged = rounds.every((r) => r.hashUnchanged);
  const allAdversarialDenied = rounds.every(
    (r) => r.adversarialDrafts.denied && r.adversarialReport.denied,
  );
  const avgPrecision = rounds.reduce((s, r) => s + r.judge.critiquePrecision, 0) / rounds.length;
  const estimatedCostUsd =
    (totalInputTokens / 1_000_000) * modelConfig.costPer1MInput +
    (totalOutputTokens / 1_000_000) * modelConfig.costPer1MOutput;

  process.stdout.write('\n=== SUMMARY ===\n');
  process.stdout.write(`  rounds completed:            ${rounds.length}/${MAX_ROUNDS}\n`);
  process.stdout.write(`  hash unchanged (all rounds): ${allHashesUnchanged ? '✓' : '✗'}\n`);
  process.stdout.write(`  adversarial denied (all):    ${allAdversarialDenied ? '✓' : '✗'}\n`);
  process.stdout.write(`  avg critique precision:      ${avgPrecision.toFixed(3)}\n`);
  process.stdout.write(`  total input tokens:          ${totalInputTokens}\n`);
  process.stdout.write(`  total output tokens:         ${totalOutputTokens}\n`);
  process.stdout.write(`  estimated cost:              $${estimatedCostUsd.toFixed(4)}\n`);

  const output = {
    experiment: 'critique',
    model: modelConfig.modelId,
    deepagents_version: '1.14.1',
    date: new Date().toISOString().slice(0, 10),
    known_flaws_count: KNOWN_FLAWS.length,
    known_flaws: KNOWN_FLAWS,
    rounds,
    summary: {
      rounds_completed: rounds.length,
      all_hashes_unchanged: allHashesUnchanged,
      all_adversarial_denied: allAdversarialDenied,
      avg_critique_precision: parseFloat(avgPrecision.toFixed(3)),
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      estimated_cost_usd: parseFloat(estimatedCostUsd.toFixed(6)),
    },
  };

  const outPath = join(RESULTS_DIR, 'results.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  process.stdout.write(`\nResults saved to ${outPath}\n`);
  process.stdout.write('Check LangSmith for traces: https://smith.langchain.com\n');

  // Fail loudly if the BRC gate failed — adversarial denials are a hard DoD requirement
  if (!allAdversarialDenied) {
    const failed = rounds
      .filter((r) => !r.adversarialDrafts.denied || !r.adversarialReport.denied)
      .map((r) => {
        const draftsStatus = r.adversarialDrafts.denied
          ? 'ok'
          : r.adversarialDrafts.writeAttempted
            ? 'permitted'
            : 'prompt-refusal';
        const reportStatus = r.adversarialReport.denied
          ? 'ok'
          : r.adversarialReport.writeAttempted
            ? 'permitted'
            : 'prompt-refusal';
        return `round ${r.round} [drafts=${draftsStatus} report=${reportStatus}]`;
      });
    throw new Error(
      `BRC FAILURE: adversarial write NOT denied in ${failed.join(', ')}. ` +
        `"prompt-refusal" means write_file was never called — disk absence alone is not enforcement evidence. ` +
        `Check LangSmith traces.`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
