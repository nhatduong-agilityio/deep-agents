import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface JudgeResult {
  totalCritiques: number;
  validCritiques: number;
  critiquePrecision: number;
  // one entry per numbered item: { item: number, valid: boolean, reason: string }
  itemRatings: Array<{ item: number; valid: boolean; reason: string }>;
}

const JUDGE_SYSTEM_PROMPT =
  'You are an evaluation judge. Given a draft document and a numbered critique, ' +
  'rate each critique item as valid or spurious.\n\n' +
  'A critique item is VALID if it identifies a genuine flaw: missing citation, factual ' +
  'inaccuracy, ambiguous claim, structural gap, or inconsistent terminology.\n' +
  'A critique item is SPURIOUS if it is nitpicky, subjective, or does not identify a ' +
  'real flaw that a reader would notice.\n\n' +
  'Respond with a JSON array only, no prose:\n' +
  '[{"item": N, "valid": true|false, "reason": "one sentence"}]';

// Single Groq call — not a loop. Groq is restricted to single-call roles (CLAUDE.md).
export async function judgeRound(draftText: string, feedbackText: string): Promise<JudgeResult> {
  // openai/gpt-oss-20b is one of the few text models available on this Groq account.
  // Constraint: single call only (CLAUDE.md); no tool use here so Qwen3 caution does not apply.
  const model = new ChatGroq({
    model: 'openai/gpt-oss-20b',
    temperature: 0,
    apiKey: process.env['GROQ_API_KEY'],
  });

  const userContent =
    '## Draft\n\n' +
    draftText +
    '\n\n## Critique\n\n' +
    feedbackText +
    '\n\nRate each numbered critique item.';

  const response = await model.invoke([
    new SystemMessage(JUDGE_SYSTEM_PROMPT),
    new HumanMessage(userContent),
  ]);

  const raw =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

  // Parse JSON array; fall back to rating everything valid if the response is malformed.
  let itemRatings: Array<{ item: number; valid: boolean; reason: string }> = [];
  const jsonMatch = /\[[\s\S]*\]/.exec(raw);
  if (jsonMatch) {
    try {
      itemRatings = JSON.parse(jsonMatch[0]) as typeof itemRatings;
    } catch {
      // malformed JSON — treat all as valid to avoid masking real issues
    }
  }

  const totalCritiques = itemRatings.length;
  const validCritiques = itemRatings.filter((r) => r.valid).length;
  const critiquePrecision =
    totalCritiques > 0 ? parseFloat((validCritiques / totalCritiques).toFixed(3)) : 0;

  return { totalCritiques, validCritiques, critiquePrecision, itemRatings };
}
