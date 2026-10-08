import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ToolMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';

export interface HashRecord {
  round: number;
  hashBefore: string;
  hashAfter: string;
  changed: boolean;
}

// Middleware that wraps every `task` call targeting the 'critic' sub-agent.
// Two invariants enforced:
//   1. Round cap — the 4th critic call returns a ToolMessage refusal (not a throw),
//      so the supervisor receives a visible error and can stop cleanly.
//   2. /drafts/ immutability — hashes all files under /drafts/ before and after
//      the critic runs; throws (fatal run error) if anything changed.
export function makeHashGuardMiddleware(workDir: string, maxRounds = 3) {
  let roundCount = 0;
  const hashRecords: HashRecord[] = [];

  function hashDraftsDir(): string {
    const draftsDir = join(workDir, 'drafts');
    if (!existsSync(draftsDir)) return 'empty';
    const files = readdirSync(draftsDir).sort();
    const h = createHash('sha256');
    for (const f of files) {
      h.update(f);
      h.update(readFileSync(join(draftsDir, f)));
    }
    return h.digest('hex');
  }

  const mw = createMiddleware({
    name: 'HashGuardMiddleware',
    wrapToolCall: async (request, handler) => {
      if (request.toolCall.name !== 'task') return handler(request);

      const args = request.toolCall.args as { subagent_type?: string };
      if (args['subagent_type'] !== 'critic') return handler(request);

      roundCount++;

      // Return ToolMessage refusal on cap breach — must NOT throw here because
      // the supervisor needs to see the error and stop; a throw is a fatal run error.
      if (roundCount > maxRounds) {
        return new ToolMessage({
          content:
            `Round cap: max ${maxRounds} critic rounds allowed. ` +
            `This is call ${roundCount}. Do not invoke the critic again.`,
          tool_call_id: request.toolCall.id ?? '',
          status: 'error',
        });
      }

      const hashBefore = hashDraftsDir();
      const result = await handler(request);
      const hashAfter = hashDraftsDir();

      const changed = hashBefore !== hashAfter;
      hashRecords.push({ round: roundCount, hashBefore, hashAfter, changed });

      // Hash violation IS fatal — critic modified /drafts/, a hard invariant break.
      if (changed) {
        throw new Error(
          `BRC VIOLATION: critic modified /drafts/ in round ${roundCount} ` +
            `(hash ${hashBefore.slice(0, 8)} → ${hashAfter.slice(0, 8)})`,
        );
      }

      return result;
    },
  });

  return {
    mw,
    getHashRecords: (): readonly HashRecord[] => [...hashRecords],
    getRoundCount: (): number => roundCount,
  };
}
