import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkReport } from '../scripts/check-report.js';

const TMP = join(process.cwd(), 'tmp', 'check-report-test');

function setup(files: Record<string, string>): string {
  const dir = join(TMP, crypto.randomUUID());
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe('checkReport', () => {
  it('passes with all required files and valid citations', () => {
    const dir = setup({
      'report/summary.md': 'A summary.',
      'report/sources.md': '- eu-ai-act-article-5.txt: Prohibitions.',
      'report/findings/finding-1.md': 'Principle 1.\nSource: eu-ai-act-article-5.txt',
      'report/findings/finding-2.md': 'Principle 2.\nSource: eu-ai-act-article-9.txt',
      'report/findings/finding-3.md': 'Principle 3.\nSource: us-eo-14110-section-4.txt',
      'corpus/eu-ai-act-article-5.txt': 'x',
      'corpus/eu-ai-act-article-9.txt': 'x',
      'corpus/us-eo-14110-section-4.txt': 'x',
    });
    const result = checkReport(dir);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.findingCount).toBe(3);
  });

  it('fails and prints FAIL lines when report/ directory is completely absent', () => {
    const dir = setup({});
    const result = checkReport(dir);
    expect(result.passed).toBe(false);
    // All three top-level checks should be issues, not silent
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
    const issueText = result.issues.join('\n');
    expect(issueText).toContain('summary.md');
    expect(issueText).toContain('sources.md');
    expect(issueText).toContain('findings/');
  });

  it('fails and prints FAIL when report/ exists but findings/ is empty', () => {
    const dir = setup({
      'report/summary.md': 'A summary.',
      'report/sources.md': '- eu-ai-act-article-5.txt: Prohibitions.',
    });
    mkdirSync(join(dir, 'report', 'findings'), { recursive: true });
    const result = checkReport(dir);
    expect(result.passed).toBe(false);
    const issueText = result.issues.join('\n');
    expect(issueText).toContain('0 .md file(s); need ≥3');
    // summary and sources should still have been checked (no early return from missing findings)
    expect(result.issues.every((i) => !i.includes('summary'))).toBe(true);
  });

  it('reports missing Source: line in a finding', () => {
    const dir = setup({
      'report/summary.md': 'A summary.',
      'report/sources.md': '- x.txt: x',
      'report/findings/finding-1.md': 'No source line here.',
      'report/findings/finding-2.md': 'Source: eu-ai-act-article-9.txt',
      'report/findings/finding-3.md': 'Source: us-eo-14110-section-4.txt',
      'corpus/eu-ai-act-article-9.txt': 'x',
      'corpus/us-eo-14110-section-4.txt': 'x',
    });
    const result = checkReport(dir);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.includes('finding-1.md') && i.includes('Source'))).toBe(
      true,
    );
  });

  it('reports citation not in corpus', () => {
    const dir = setup({
      'report/summary.md': 'A summary.',
      'report/sources.md': '- x.txt: x',
      'report/findings/finding-1.md': 'Source: invented-file.txt',
      'report/findings/finding-2.md': 'Source: eu-ai-act-article-9.txt',
      'report/findings/finding-3.md': 'Source: us-eo-14110-section-4.txt',
      'corpus/eu-ai-act-article-9.txt': 'x',
      'corpus/us-eo-14110-section-4.txt': 'x',
    });
    const result = checkReport(dir);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.includes('invented-file.txt'))).toBe(true);
  });
});
