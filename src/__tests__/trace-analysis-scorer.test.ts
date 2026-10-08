import { describe, it, expect } from 'vitest';
import { scoreDraft, MIN_DRAFT_CHARS } from '../experiments/trace-analysis/scorer.js';

// Minimal draft that passes the length guard (≥200 chars).
// Contains correct terminology and all section guards, but no seeded flaws.
const CLEAN_DRAFT = [
  'The EU AI Act establishes a risk-based approach to AI regulation. High-risk AI systems are',
  'defined in Annex III and Article 6 of the Act. Transparency requirements apply to certain',
  'AI systems used in specific contexts, but not universally to all AI systems deployed to',
  'interact with humans. Executive Order Section 4 requires agencies to adopt safety practices',
  'for high-impact AI uses. The EU AI Act imposes differentiated penalty tiers on providers.',
  'AI systems must meet ongoing requirements. Section 4 directs agency AI governance.',
].join(' ');

// Seeded-flaw draft that matches the T-DA-05 initial draft characteristics.
const FLAWED_DRAFT = [
  'High-risk AI systems under the EU AI Act include those used in critical infrastructure.',
  'All AI systems deployed to interact with humans must disclose their AI nature to users.',
  'Section 4 of the Order mandates comprehensive safety testing for all federal AI deployments.',
  'Companies face fines of up to 6% of global annual turnover for serious violations.',
  'The convergence of AI algorithms and traditional automated systems presents ongoing',
  'definitional challenges for regulators.',
].join(' ');

describe('scoreDraft — no-draft guard', () => {
  it('returns no-draft for empty string', () => {
    const result = scoreDraft('');
    expect(result.status).toBe('no-draft');
    expect(result.flawsFixed).toBe(0);
    expect(result.details).toHaveLength(0);
  });

  it('returns no-draft for whitespace-only string', () => {
    const result = scoreDraft('   \n\t  ');
    expect(result.status).toBe('no-draft');
  });

  it('returns no-draft for a draft under MIN_DRAFT_CHARS chars', () => {
    const shortDraft = 'AI systems are regulated.'.repeat(3); // ~75 chars
    expect(shortDraft.trim().length).toBeLessThan(MIN_DRAFT_CHARS);
    const result = scoreDraft(shortDraft);
    expect(result.status).toBe('no-draft');
    expect(result.draftLength).toBe(shortDraft.trim().length);
  });

  it('includes the draft length in the no-draft result reason', () => {
    const result = scoreDraft('too short');
    expect(result.reason).toContain('9');
    expect(result.reason).toContain(String(MIN_DRAFT_CHARS));
  });
});

describe('scoreDraft — clean draft (all flaws fixed)', () => {
  it('returns status scored', () => {
    const result = scoreDraft(CLEAN_DRAFT);
    expect(result.status).toBe('scored');
  });

  it('has 5 detail entries', () => {
    const result = scoreDraft(CLEAN_DRAFT);
    expect(result.details).toHaveLength(5);
  });

  it('scores F1 as fixed when Annex III and high-risk present', () => {
    const result = scoreDraft(CLEAN_DRAFT);
    const f1 = result.details.find((d) => d.id === 'F1')!;
    expect(f1.fixed).toBe(true);
  });

  it('scores F5 as NOT fixed when "AI systems" absent — section-deletion guard', () => {
    // Replace "AI systems" with nothing to simulate section deletion
    const noAiSystems = CLEAN_DRAFT.replace(/\bai systems?\b/gi, 'the models');
    const result = scoreDraft(noAiSystems);
    const f5 = result.details.find((d) => d.id === 'F5')!;
    expect(f5.fixed).toBe(false);
    expect(f5.reason).toContain('section may have been deleted');
  });
});

describe('scoreDraft — flawed draft (all 5 flaws present)', () => {
  it('scores 0/5 flaws fixed', () => {
    const result = scoreDraft(FLAWED_DRAFT);
    expect(result.status).toBe('scored');
    expect(result.flawsFixed).toBe(0);
  });

  it('F1 not fixed: high-risk section present but no Annex III / Article 6 citation', () => {
    const f1 = scoreDraft(FLAWED_DRAFT).details.find((d) => d.id === 'F1')!;
    expect(f1.fixed).toBe(false);
    expect(f1.reason).toContain('cited');
  });

  it('F2 not fixed: overclaim "all AI systems must disclose" present', () => {
    const f2 = scoreDraft(FLAWED_DRAFT).details.find((d) => d.id === 'F2')!;
    expect(f2.fixed).toBe(false);
  });

  it('F3 not fixed: "comprehensive safety testing for all federal AI deployments" present', () => {
    const f3 = scoreDraft(FLAWED_DRAFT).details.find((d) => d.id === 'F3')!;
    expect(f3.fixed).toBe(false);
  });

  it('F4 not fixed: 6% claim present and Article 99 not cited', () => {
    const f4 = scoreDraft(FLAWED_DRAFT).details.find((d) => d.id === 'F4')!;
    expect(f4.fixed).toBe(false);
  });

  it('F5 not fixed: "AI algorithms" and "automated systems" present', () => {
    const f5 = scoreDraft(FLAWED_DRAFT).details.find((d) => d.id === 'F5')!;
    expect(f5.fixed).toBe(false);
  });
});

describe('scoreDraft — F5 false-positive regression', () => {
  it('empty string does NOT score F5 as fixed (original bug)', () => {
    // The old countFlawsFixed('') returned 1 because !regex.test('') = true for both conditions.
    // The new scoreDraft returns no-draft, so flawsFixed = 0.
    const result = scoreDraft('');
    expect(result.flawsFixed).toBe(0);
    expect(result.status).toBe('no-draft');
  });

  it('short text without "AI systems" does NOT score F5 as fixed', () => {
    // Stub ≥200 chars that never uses "AI systems" — F5 positive guard requires the term
    const stub =
      'The regulatory landscape is complex. Authorities disagree on definitions. Standards are ' +
      'evolving across jurisdictions. The implications for industry are significant. Compliance ' +
      'timelines vary by sector and region.';
    expect(stub.trim().length).toBeGreaterThanOrEqual(MIN_DRAFT_CHARS);
    const result = scoreDraft(stub);
    const f5 = result.details.find((d) => d.id === 'F5')!;
    expect(f5.fixed).toBe(false);
  });
});

describe('scoreDraft — F4 alternative paths', () => {
  const baseWithPenalties = (extra: string): string =>
    `High-risk AI systems face penalty tiers. The EU Act imposes fines on providers. ${extra} ` +
    'Transparency is required for certain AI systems. Executive Order Section 4 governs agency AI.';

  it('F4 fixed via Article 99 citation', () => {
    const draft = baseWithPenalties('See Article 99 for the full penalty schedule.');
    const result = scoreDraft(draft);
    const f4 = result.details.find((d) => d.id === 'F4')!;
    expect(f4.fixed).toBe(true);
    expect(f4.reason).toContain('Article 99');
  });

  it('F4 fixed via removal of 6% claim (no Article 99)', () => {
    const draft = baseWithPenalties('No specific percentage is cited here.');
    const result = scoreDraft(draft);
    const f4 = result.details.find((d) => d.id === 'F4')!;
    expect(f4.fixed).toBe(true);
    expect(f4.reason).toContain('6% claim removed');
  });

  it('F4 NOT fixed when 6% claim present and no Article 99', () => {
    const draft = baseWithPenalties('Fines reach 6% of global turnover.');
    const result = scoreDraft(draft);
    const f4 = result.details.find((d) => d.id === 'F4')!;
    expect(f4.fixed).toBe(false);
  });
});
