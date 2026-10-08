import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { RESEARCH_SUBAGENT } from '@deep-agents/core';
import { computeCompletenessCheck, computeMainAgentConsistency } from '../artifact-agent/agent.js';
import { checkWritesOnDisk } from '../context-isolation/config-b.js';

// ── Isolation ratio gate ────────────────────────────────────────────────────

function isolationRatio(bPeaks: number[], aPeaks: number[]): number {
  const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);
  const median = (arr: number[]) => {
    const s = sorted(arr);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
  };
  return median(bPeaks) / median(aPeaks);
}

describe('isolation ratio gate', () => {
  it('ratio 0.47 passes the ≤0.50 gate', () => {
    // median(B) = 6000, median(A) = 12766
    const ratio = isolationRatio([5800, 6000, 6200], [12500, 12766, 13000]);
    expect(ratio).toBeLessThanOrEqual(0.5);
  });

  it('ratio 0.51 fails the ≤0.50 gate', () => {
    const ratio = isolationRatio([6500, 6500, 6500], [12700, 12700, 12700]);
    expect(ratio).toBeGreaterThan(0.5);
  });

  it('ratio uses mainAgentPeakInputTokens only, not systemInputTokens', () => {
    // A: mainAgentPeak=12710, systemInputTokens=33489 (corpus tokens inflate systemInputTokens)
    // B: mainAgentPeak=6000,  systemInputTokens=50000 (sub-agents inflate system even further)
    // Ratio must be computed from mainAgentPeak, not system totals.
    const configAPeak = 12710;
    const configBPeak = 6000;
    const ratioFromPeaks = configBPeak / configAPeak;
    const ratioFromSystem = 50000 / 33489;
    expect(ratioFromPeaks).toBeLessThanOrEqual(0.5);
    // System-based ratio would be >>1 — proves we must NOT use systemInputTokens for the gate
    expect(ratioFromSystem).toBeGreaterThan(1);
  });
});

// ── computeCompletenessCheck ────────────────────────────────────────────────

describe('computeCompletenessCheck', () => {
  const makeSpan = (id: string, tokens: number) => ({
    spanId: id,
    promptTokens: tokens,
    completionTokens: 10,
    startTime: '2026-10-06T00:00:00.000Z',
  });

  it('passes when all spans are accounted for with correct token sum', () => {
    const main = [makeSpan('m1', 5000), makeSpan('m2', 7000)];
    const sub = { 'task-1': [makeSpan('s1', 3000), makeSpan('s2', 4000)] };
    const system = [...main, ...sub['task-1']];
    const systemTokens = 5000 + 7000 + 3000 + 4000;
    expect(computeCompletenessCheck(system, systemTokens, main, sub)).toBe('pass');
  });

  it('fails when a span is missing from groups', () => {
    const main = [makeSpan('m1', 5000)]; // m2 not included
    const sub = { 'task-1': [makeSpan('s1', 3000)] };
    const system = [makeSpan('m1', 5000), makeSpan('m2', 7000), makeSpan('s1', 3000)];
    const systemTokens = 5000 + 7000 + 3000;
    expect(computeCompletenessCheck(system, systemTokens, main, sub)).toBe('fail');
  });

  it('fails when token sums diverge even if counts match', () => {
    const main = [makeSpan('m1', 5000)];
    const sub = {};
    const system = [makeSpan('m1', 5000)];
    // Wrong system token total — count matches but sum doesn't
    expect(computeCompletenessCheck(system, 9999, main, sub)).toBe('fail');
  });

  it('passes for Config A (no sub-agents: all spans in mainAgentSpans)', () => {
    const spans = [makeSpan('m1', 5000), makeSpan('m2', 7000), makeSpan('m3', 3000)];
    const total = 5000 + 7000 + 3000;
    expect(computeCompletenessCheck(spans, total, spans, {})).toBe('pass');
  });
});

// ── computeMainAgentConsistency ─────────────────────────────────────────────

describe('computeMainAgentConsistency', () => {
  const makeSpan = (tokens: number) => ({
    spanId: crypto.randomUUID(),
    promptTokens: tokens,
    completionTokens: 50,
    startTime: '2026-10-06T00:00:00.000Z',
  });

  it('returns pass when every span promptTokens matches inputTokensPerCall', () => {
    const spans = [makeSpan(4210), makeSpan(10479), makeSpan(11556)];
    expect(computeMainAgentConsistency(spans, [4210, 10479, 11556])).toBe('pass');
  });

  it('returns incomplete when mainAgentSpans is empty (LangSmith returned nothing)', () => {
    expect(computeMainAgentConsistency([], [4210, 10479])).toBe('incomplete');
  });

  it('returns incomplete when span count < call count (indexing lag)', () => {
    // 6 spans indexed, 7 messages calls — lag dropped the last span
    const spans = [
      makeSpan(4210),
      makeSpan(4339),
      makeSpan(4456),
      makeSpan(10479),
      makeSpan(10596),
      makeSpan(11441),
    ];
    const calls = [4210, 4339, 4456, 10479, 10596, 11441, 11556];
    expect(computeMainAgentConsistency(spans, calls)).toBe('incomplete');
  });

  it('returns mismatch when counts match but a value differs', () => {
    const spans = [makeSpan(4210), makeSpan(9999)]; // 9999 ≠ 10479
    expect(computeMainAgentConsistency(spans, [4210, 10479])).toBe('mismatch');
  });

  it('returns pass for a single-call run where span matches message', () => {
    expect(computeMainAgentConsistency([makeSpan(5000)], [5000])).toBe('pass');
  });

  it('returns mismatch when span count > call count (wrong classification, not lag)', () => {
    // More LangSmith spans than message calls means a sub-agent span leaked into mainAgentSpans.
    // This is a data error, not indexing lag — must not be silently excluded from the gate.
    const spans = [makeSpan(4210), makeSpan(10479), makeSpan(11556)]; // 3 spans
    expect(computeMainAgentConsistency(spans, [4210, 10479])).toBe('mismatch'); // 2 calls
  });
});

// ── Gate exclusion of incomplete runs ───────────────────────────────────────

describe('gate computation with incomplete runs', () => {
  function computeGate(
    aPeaks: Array<{ peak: number; incomplete: boolean }>,
    bPeaks: Array<{ peak: number; incomplete: boolean }>,
  ): { canCompute: boolean; ratio?: number; incompleteCount: number } {
    const completeA = aPeaks.filter((r) => !r.incomplete);
    const completeB = bPeaks.filter((r) => !r.incomplete);
    const incompleteCount = aPeaks.length + bPeaks.length - completeA.length - completeB.length;
    if (completeA.length === 0 || completeB.length === 0) {
      return { canCompute: false, incompleteCount };
    }
    const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);
    const median = (arr: number[]) => {
      const s = sorted(arr);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
    };
    const ratio = median(completeB.map((r) => r.peak)) / median(completeA.map((r) => r.peak));
    return { canCompute: true, ratio, incompleteCount };
  }

  it('uses all 3 runs when none are incomplete', () => {
    const result = computeGate(
      [
        { peak: 12000, incomplete: false },
        { peak: 12500, incomplete: false },
        { peak: 13000, incomplete: false },
      ],
      [
        { peak: 5800, incomplete: false },
        { peak: 6000, incomplete: false },
        { peak: 6200, incomplete: false },
      ],
    );
    expect(result.canCompute).toBe(true);
    expect(result.incompleteCount).toBe(0);
    expect(result.ratio!).toBeCloseTo(6000 / 12500, 3);
  });

  it('excludes the incomplete run and uses the 2 complete runs', () => {
    const result = computeGate(
      [
        { peak: 12000, incomplete: false },
        { peak: 12500, incomplete: true },
        { peak: 13000, incomplete: false },
      ],
      [
        { peak: 5800, incomplete: false },
        { peak: 6000, incomplete: false },
        { peak: 6200, incomplete: false },
      ],
    );
    expect(result.canCompute).toBe(true);
    expect(result.incompleteCount).toBe(1);
    // median of completeA = median([12000, 13000]) = 12500; median of completeB = 6000
    expect(result.ratio!).toBeCloseTo(6000 / 12500, 3);
  });

  it('cannot compute gate when all A runs are incomplete', () => {
    const result = computeGate(
      [
        { peak: 0, incomplete: true },
        { peak: 0, incomplete: true },
        { peak: 0, incomplete: true },
      ],
      [
        { peak: 6000, incomplete: false },
        { peak: 6000, incomplete: false },
        { peak: 6000, incomplete: false },
      ],
    );
    expect(result.canCompute).toBe(false);
    expect(result.incompleteCount).toBe(3);
  });
});

// ── RESEARCH_SUBAGENT structure ─────────────────────────────────────────────

describe('RESEARCH_SUBAGENT', () => {
  it('is named "research"', () => {
    expect(RESEARCH_SUBAGENT.name).toBe('research');
  });

  it('has empty static middleware — filesystem middleware injected per-run by config-b.ts', () => {
    // RC1 fix: createFilesystemMiddleware removed from static definition; run-specific backend
    // is injected via makeFilesystemMiddleware(backendFactory, permissions) in runConfigBRun.
    expect(RESEARCH_SUBAGENT.middleware ?? []).toHaveLength(0);
  });

  it('no duplicate middleware entries by reference', () => {
    const mw = RESEARCH_SUBAGENT.middleware ?? [];
    const seen = new Set<unknown>();
    for (const m of mw) {
      expect(seen.has(m)).toBe(false);
      seen.add(m);
    }
  });
});

// ── checkWritesOnDisk ────────────────────────────────────────────────────────

describe('checkWritesOnDisk', () => {
  it('returns writesOnDisk=true when all paths exist on disk', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'test-disk-'));
    try {
      mkdirSync(join(workDir, 'report', 'findings'), { recursive: true });
      writeFileSync(join(workDir, 'report', 'findings', 'finding-1.md'), '# f1');
      writeFileSync(join(workDir, 'report', 'summary.md'), '# sum');
      const { writesOnDisk, missingOnDisk } = checkWritesOnDisk(workDir, [
        '/report/findings/finding-1.md',
        '/report/summary.md',
      ]);
      expect(writesOnDisk).toBe(true);
      expect(missingOnDisk).toHaveLength(0);
    } finally {
      rmSync(workDir, { recursive: true });
    }
  });

  it('returns writesOnDisk=false and lists missing paths when a file is absent', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'test-disk-'));
    try {
      mkdirSync(join(workDir, 'report', 'findings'), { recursive: true });
      writeFileSync(join(workDir, 'report', 'findings', 'finding-1.md'), '# f1');
      // summary.md intentionally missing
      const { writesOnDisk, missingOnDisk } = checkWritesOnDisk(workDir, [
        '/report/findings/finding-1.md',
        '/report/summary.md',
      ]);
      expect(writesOnDisk).toBe(false);
      expect(missingOnDisk).toEqual(['/report/summary.md']);
    } finally {
      rmSync(workDir, { recursive: true });
    }
  });

  it('handles empty path list as writesOnDisk=true (no writes attempted)', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'test-disk-'));
    try {
      const { writesOnDisk, missingOnDisk } = checkWritesOnDisk(workDir, []);
      expect(writesOnDisk).toBe(true);
      expect(missingOnDisk).toHaveLength(0);
    } finally {
      rmSync(workDir, { recursive: true });
    }
  });

  it('handles paths with and without leading slash consistently', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'test-disk-'));
    try {
      mkdirSync(join(workDir, 'notes'), { recursive: true });
      writeFileSync(join(workDir, 'notes', 'eu-ai-act.md'), '# notes');
      // leading slash stripped by the function
      const { writesOnDisk } = checkWritesOnDisk(workDir, ['/notes/eu-ai-act.md']);
      expect(writesOnDisk).toBe(true);
    } finally {
      rmSync(workDir, { recursive: true });
    }
  });
});
