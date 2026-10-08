// Config A: single-agent baseline for T-DA-04 Context Isolation Proof.
// Reuses runArtifactRun with a dedicated workspace so T-DA-03 evidence dirs are untouched.

import { join } from 'node:path';
import { checkReport } from '../../scripts/check-report.js';
import { runArtifactRun, type ModelConfig, type RunResult } from '../artifact-agent/agent.js';

export const CONFIG_A_WORKSPACE = join(process.cwd(), 'tmp', 'context-isolation', 'a');

export async function runConfigARun(
  runIndex: number,
  modelConfig: ModelConfig,
): Promise<RunResult> {
  process.stdout.write(`    checking report for Config A run ${runIndex}...\n`);
  return runArtifactRun(runIndex, checkReport, CONFIG_A_WORKSPACE, modelConfig);
}
