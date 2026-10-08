// Minimum draft length below which we treat the run as a process failure, not a score.
// Protects negative-condition checks (F2, F3, F5) from false positives on missing/empty drafts.
export const MIN_DRAFT_CHARS = 200;

export interface FlawCheckResult {
  id: string;
  fixed: boolean;
  reason: string;
}

export interface ScorerResult {
  status: 'scored' | 'no-draft';
  draftLength: number;
  flawsFixed: number;
  details: FlawCheckResult[];
  reason?: string;
}

// Scores a committed draft against the 5 seeded flaws from T-DA-05.
// Returns status='no-draft' (not a score) when the draft is missing or too short.
//
// F1: positive condition — Annex III / Article 6 must be cited
// F2: mixed — transparency section must exist + overclaim must be absent
// F3: mixed — EO section must exist + broad-mandate overclaim must be absent
// F4: mixed — penalties section must exist + (Article 99 cited OR uncited 6% removed)
// F5: mixed — "AI systems" must appear + problematic terms must be absent
//
// Negative conditions (F2, F3, F5, F4 option-2) require a positive section-presence
// guard so that deleting the section cannot count as a fix.
export function scoreDraft(draftText: string): ScorerResult {
  const len = draftText.trim().length;
  if (len < MIN_DRAFT_CHARS) {
    return {
      status: 'no-draft',
      draftLength: len,
      flawsFixed: 0,
      details: [],
      reason: `draft absent or too short (${len} chars < ${MIN_DRAFT_CHARS}); process failure — not a score`,
    };
  }

  const details: FlawCheckResult[] = [];

  // F1 — High-risk citation: Annex III or Article 6 must appear in the high-risk section.
  // Purely positive: requires the citation be present, not just the flaw phrase absent.
  const f1Section = /high.risk/i.test(draftText);
  const f1Cited = /annex iii|article 6\b/i.test(draftText);
  details.push({
    id: 'F1',
    fixed: f1Section && f1Cited,
    reason: !f1Section
      ? 'high-risk section absent'
      : !f1Cited
        ? 'neither "Annex III" nor "Article 6" cited'
        : 'Annex III / Article 6 cited',
  });

  // F2 — Transparency overclaim: "all AI systems must disclose" must be absent.
  // Negative condition guarded by section-presence (transparency / disclose still appears).
  const f2Section = /transparency|disclose/i.test(draftText);
  const f2Overclaim = /all ai systems.*must disclose/i.test(draftText);
  details.push({
    id: 'F2',
    fixed: f2Section && !f2Overclaim,
    reason: !f2Section
      ? 'transparency section absent — deleting a section is not a fix'
      : f2Overclaim
        ? 'overclaim "all AI systems must disclose" still present'
        : 'transparency section present; overclaim removed',
  });

  // F3 — Section 4 broad-mandate overclaim: "comprehensive safety testing for all
  // federal AI deployments" must be absent.
  // Negative condition guarded by EO section presence.
  const f3Section = /executive order|section 4\b/i.test(draftText);
  const f3Overclaim =
    /comprehensive safety testing for all/i.test(draftText) ||
    /all federal ai deployments/i.test(draftText);
  details.push({
    id: 'F3',
    fixed: f3Section && !f3Overclaim,
    reason: !f3Section
      ? 'EO / Section 4 section absent — deleting a section is not a fix'
      : f3Overclaim
        ? 'overclaim "comprehensive safety testing for all federal AI deployments" still present'
        : 'EO section present; broad-mandate overclaim removed',
  });

  // F4 — Uncited 6% penalty: either Article 99 must be cited, OR the uncited
  // specific-percentage claim must be absent.
  // Negative option guarded by penalties section presence.
  const f4Section = /penalt|fine/i.test(draftText);
  const f4Cited = /article 99\b/i.test(draftText);
  const f4UncitedClaim = /\b6\s*%|6 per.?cent/i.test(draftText);
  details.push({
    id: 'F4',
    fixed: f4Section && (f4Cited || !f4UncitedClaim),
    reason: !f4Section
      ? 'penalties section absent — deleting a section is not a fix'
      : f4Cited
        ? 'Article 99 cited'
        : !f4UncitedClaim
          ? 'uncited 6% claim removed; penalties section present'
          : 'uncited 6% claim still present and Article 99 not cited',
  });

  // F5 — Terminology: "AI systems" must appear (positive guard), and "AI algorithms"
  // / "automated systems" must be absent.
  // Negative conditions guarded by positive term usage.
  const f5CorrectTerm = /\bai systems?\b/i.test(draftText);
  const f5BadAlgo = /\bai algorithms?\b/i.test(draftText);
  const f5BadAuto = /\bautomated systems?\b/i.test(draftText);
  details.push({
    id: 'F5',
    fixed: f5CorrectTerm && !f5BadAlgo && !f5BadAuto,
    reason: !f5CorrectTerm
      ? '"AI systems" not found — the section may have been deleted'
      : f5BadAlgo
        ? '"AI algorithms" still present'
        : f5BadAuto
          ? '"automated systems" still present'
          : '"AI systems" used; "AI algorithms" and "automated systems" absent',
  });

  const flawsFixed = details.filter((d) => d.fixed).length;
  return { status: 'scored', draftLength: len, flawsFixed, details };
}
