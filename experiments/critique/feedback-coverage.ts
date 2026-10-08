import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ToolMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';

// Count numbered list items in text (lines starting with "1.", "2.", "1:", "2:", etc.)
export function countNumberedItems(text: string): number {
  return (text.match(/^\d+[.:]\s/gm) ?? []).length;
}

// Parse draft version from a /drafts/draft-vN.md path — returns N or null.
export function parseDraftVersion(virtualPath: string): number | null {
  const m = /\/drafts\/draft-v(\d+)\.md$/.exec(virtualPath);
  return m ? parseInt(m[1]!, 10) : null;
}

export interface GateRecord {
  round: number;
  draftVersion: number;
  feedbackItems: number;
  revisionItems: number;
  blocked: boolean;
}

// Middleware that blocks write_file to /drafts/draft-vN.md (N > 1) until the
// corresponding /notes/revision-(N-1).md covers at least as many items as
// /feedback/round-(N-1).md. This enforces coverage before the draft is committed —
// purely mechanical (item count), not semantic.
export function makeRevisionGateMiddleware(workDir: string) {
  const gateRecords: GateRecord[] = [];

  const mw = createMiddleware({
    name: 'RevisionGateMiddleware',
    wrapToolCall: async (request, handler) => {
      if (request.toolCall.name !== 'write_file') return handler(request);

      const args = request.toolCall.args as Record<string, string>;
      const virtualPath: string = args['file_path'] ?? args['path'] ?? '';
      const draftVersion = parseDraftVersion(virtualPath);

      // Only gate draft writes for version > 1 (round 1 has no feedback yet)
      if (draftVersion === null || draftVersion <= 1) return handler(request);

      const roundNumber = draftVersion - 1;
      const feedbackPath = join(workDir, 'feedback', `round-${roundNumber}.md`);
      const revisionPath = join(workDir, 'notes', `revision-${roundNumber}.md`);

      const feedbackText = existsSync(feedbackPath) ? readFileSync(feedbackPath, 'utf8') : '';
      const revisionText = existsSync(revisionPath) ? readFileSync(revisionPath, 'utf8') : '';

      const feedbackItems = countNumberedItems(feedbackText);
      const revisionItems = countNumberedItems(revisionText);

      const blocked = feedbackItems > 0 && revisionItems < feedbackItems;

      gateRecords.push({
        round: roundNumber,
        draftVersion,
        feedbackItems,
        revisionItems,
        blocked,
      });

      if (blocked) {
        const missing = feedbackItems - revisionItems;
        return new ToolMessage({
          content:
            `Draft rejected by RevisionGateMiddleware: ` +
            `/feedback/round-${roundNumber}.md has ${feedbackItems} items but ` +
            `/notes/revision-${roundNumber}.md only covers ${revisionItems}. ` +
            `${missing} item(s) unaccounted for. ` +
            `Write /notes/revision-${roundNumber}.md with all ${feedbackItems} numbered items ` +
            `("Item N: <change made>") before writing the draft.`,
          tool_call_id: request.toolCall.id ?? '',
          status: 'error',
        });
      }

      return handler(request);
    },
  });

  return {
    mw,
    getGateRecords: (): readonly GateRecord[] => [...gateRecords],
    getBlockCount: (): number => gateRecords.filter((r) => r.blocked).length,
  };
}
