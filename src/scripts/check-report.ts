import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * Deterministic report checker — no LLM judge.
 *
 * Usage: node --import tsx/esm src/scripts/check-report.ts <reportDir>
 * Exit 0 = all checks pass; exit 1 = one or more failures.
 */

export interface CheckResult {
  passed: boolean;
  findingCount: number;
  issues: string[];
}

export function checkReport(reportDir: string): CheckResult {
  const issues: string[] = [];

  const reportPath = join(reportDir, 'report');
  const summaryPath = join(reportPath, 'summary.md');
  const findingsDir = join(reportPath, 'findings');
  const sourcesPath = join(reportPath, 'sources.md');

  // 1. summary.md exists and is non-empty
  if (!existsSync(summaryPath)) {
    issues.push('FAIL: /report/summary.md does not exist');
  } else if (readFileSync(summaryPath, 'utf8').trim().length === 0) {
    issues.push('FAIL: /report/summary.md is empty');
  } else {
    process.stdout.write('  PASS: /report/summary.md exists and is non-empty\n');
  }

  // 2. sources.md exists and is non-empty
  if (!existsSync(sourcesPath)) {
    issues.push('FAIL: /report/sources.md does not exist');
  } else if (readFileSync(sourcesPath, 'utf8').trim().length === 0) {
    issues.push('FAIL: /report/sources.md is empty');
  } else {
    process.stdout.write('  PASS: /report/sources.md exists and is non-empty\n');
  }

  // 3. findings/ directory has ≥3 .md files
  if (!existsSync(findingsDir) || !statSync(findingsDir).isDirectory()) {
    issues.push('FAIL: /report/findings/ directory does not exist');
    return { passed: false, findingCount: 0, issues };
  }

  const findingFiles = readdirSync(findingsDir).filter((f) => f.endsWith('.md'));
  if (findingFiles.length < 3) {
    issues.push(`FAIL: /report/findings/ has ${findingFiles.length} .md file(s); need ≥3`);
  } else {
    process.stdout.write(`  PASS: /report/findings/ has ${findingFiles.length} .md file(s)\n`);
  }

  // 4. Each finding must cite a corpus source via "Source: <filename>" line
  const corpusDir = join(process.cwd(), 'corpus');
  const corpusFiles = existsSync(corpusDir)
    ? new Set(readdirSync(corpusDir).map((f) => f.toLowerCase()))
    : new Set<string>();

  // Also accept corpus filenames copied into the run's workDir
  const runCorpusDir = join(reportDir, 'corpus');
  if (existsSync(runCorpusDir)) {
    for (const f of readdirSync(runCorpusDir)) {
      corpusFiles.add(f.toLowerCase());
    }
  }

  for (const file of findingFiles) {
    const content = readFileSync(join(findingsDir, file), 'utf8');
    const sourceMatch = /^Source:\s*(.+)/im.exec(content);
    if (!sourceMatch) {
      issues.push(`FAIL: ${file} has no "Source: <filename>" line`);
      continue;
    }
    const cited = basename(sourceMatch[1].trim()).toLowerCase();
    if (!corpusFiles.has(cited)) {
      issues.push(
        `FAIL: ${file} cites "${sourceMatch[1].trim()}" which is not in the corpus (known: ${[...corpusFiles].join(', ')})`,
      );
    } else {
      process.stdout.write(`  PASS: ${file} cites "${sourceMatch[1].trim()}"\n`);
    }
  }

  return { passed: issues.length === 0, findingCount: findingFiles.length, issues };
}

// CLI entrypoint — only executes when this file is the entry point, not when imported
const isDirectRun =
  process.argv[1]?.endsWith('check-report.ts') || process.argv[1]?.endsWith('check-report.js');

if (isDirectRun) {
  const reportDir = process.argv[2];
  if (!reportDir) {
    process.stderr.write('Usage: check-report.ts <reportDir>\n');
    process.exit(1);
  }

  const result = checkReport(reportDir);
  if (result.issues.length > 0) {
    for (const issue of result.issues) {
      process.stderr.write(`${issue}\n`);
    }
  }
  process.stdout.write(
    `\nResult: ${result.passed ? 'PASS' : 'FAIL'} — ${result.findingCount} finding(s)\n`,
  );
  process.exit(result.passed ? 0 : 1);
}
