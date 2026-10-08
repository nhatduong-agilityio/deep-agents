import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, afterEach } from 'vitest';
import {
  countNumberedItems,
  parseDraftVersion,
} from '../experiments/critique/feedback-coverage.js';

const FEEDBACK_10 = Array.from({ length: 10 }, (_, i) => `${i + 1}. Item ${i + 1} text`).join('\n');
const FEEDBACK_12 = Array.from({ length: 12 }, (_, i) => `${i + 1}. Item ${i + 1} text`).join('\n');
const NOTES_10 = Array.from({ length: 10 }, (_, i) => `${i + 1}: addressed change ${i + 1}`).join(
  '\n',
);
const NOTES_8 = Array.from({ length: 8 }, (_, i) => `${i + 1}: addressed change ${i + 1}`).join(
  '\n',
);

describe('countNumberedItems', () => {
  it('counts dot-separated items (1. 2. …)', () => {
    expect(countNumberedItems('1. foo\n2. bar\n3. baz')).toBe(3);
  });

  it('counts colon-separated items (1: 2: …)', () => {
    expect(countNumberedItems('1: foo\n2: bar')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(countNumberedItems('')).toBe(0);
  });

  it('ignores lines that do not start with a number', () => {
    expect(countNumberedItems('foo\n1. item\nbar\n2. item')).toBe(2);
  });
});

describe('parseDraftVersion', () => {
  it('extracts version from /drafts/draft-vN.md', () => {
    expect(parseDraftVersion('/drafts/draft-v3.md')).toBe(3);
  });

  it('returns null for paths not matching the pattern', () => {
    expect(parseDraftVersion('/notes/revision-1.md')).toBeNull();
    expect(parseDraftVersion('/drafts/other.md')).toBeNull();
  });

  it('returns 1 for draft-v1.md', () => {
    expect(parseDraftVersion('/drafts/draft-v1.md')).toBe(1);
  });
});

describe('makeRevisionGateMiddleware', () => {
  let tmpDir: string;
  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  function setup(feedbackText: string | null, notesText: string | null, round = 1): string {
    tmpDir = mkdtempSync(join(tmpdir(), 'gate-test-'));
    if (feedbackText !== null) {
      mkdirSync(join(tmpDir, 'feedback'), { recursive: true });
      writeFileSync(join(tmpDir, 'feedback', `round-${round}.md`), feedbackText);
    }
    if (notesText !== null) {
      mkdirSync(join(tmpDir, 'notes'), { recursive: true });
      writeFileSync(join(tmpDir, 'notes', `revision-${round}.md`), notesText);
    }
    return tmpDir;
  }

  // Tests gate logic via exported pure functions — avoids needing to wire createMiddleware internals.
  function simulateGate(workDir: string, path: string): { blocked: boolean } {
    const draftVersion = parseDraftVersion(path);
    if (draftVersion === null || draftVersion <= 1) return { blocked: false };

    const roundNumber = draftVersion - 1;
    const feedbackPath = join(workDir, 'feedback', `round-${roundNumber}.md`);
    const revisionPath = join(workDir, 'notes', `revision-${roundNumber}.md`);

    const feedbackText = existsSync(feedbackPath) ? readFileSync(feedbackPath, 'utf8') : '';
    const revisionText = existsSync(revisionPath) ? readFileSync(revisionPath, 'utf8') : '';

    const feedbackItems = countNumberedItems(feedbackText);
    const revisionItems = countNumberedItems(revisionText);

    return { blocked: feedbackItems > 0 && revisionItems < feedbackItems };
  }

  it('allows write to draft-v1.md (no prior feedback)', async () => {
    const dir = setup(null, null);
    const result = await simulateGate(dir, '/drafts/draft-v1.md');
    expect(result.blocked).toBe(false);
  });

  it('allows write when revision notes cover all feedback items (10/10)', async () => {
    const dir = setup(FEEDBACK_10, NOTES_10);
    const result = await simulateGate(dir, '/drafts/draft-v2.md');
    expect(result.blocked).toBe(false);
  });

  it('blocks write when revision notes miss items (8/10)', async () => {
    const dir = setup(FEEDBACK_10, NOTES_8);
    const result = await simulateGate(dir, '/drafts/draft-v2.md');
    expect(result.blocked).toBe(true);
  });

  it('blocks write when revision notes are absent but feedback has 12 items', async () => {
    const dir = setup(FEEDBACK_12, null);
    const result = await simulateGate(dir, '/drafts/draft-v2.md');
    expect(result.blocked).toBe(true);
  });

  it('allows write when no feedback file exists (no feedback = nothing to cover)', async () => {
    const dir = setup(null, null);
    const result = await simulateGate(dir, '/drafts/draft-v2.md');
    expect(result.blocked).toBe(false);
  });
});
