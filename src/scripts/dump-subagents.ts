/**
 * Dumps the sub-agent specs that would be registered with the task tool.
 * Confirms only one general-purpose sub-agent exists and that geminiToolFilter
 * is present in its middleware stack.
 *
 * Run: npx tsx --env-file=.env src/scripts/dump-subagents.ts
 */
import { GENERAL_PURPOSE_SUBAGENT } from 'deepagents';
import { withGeminiCompat } from '../lib/with-gemini-compat.js';

const subagents = [withGeminiCompat(GENERAL_PURPOSE_SUBAGENT)];

process.stdout.write(`Sub-agents registered with task tool: ${subagents.length}\n\n`);
for (const spec of subagents) {
  process.stdout.write(`  name:        ${spec.name}\n`);
  process.stdout.write(`  mode:        ${spec.mode ?? 'isolated'}\n`);
  process.stdout.write(`  description: ${spec.description.slice(0, 80)}...\n`);
  const mw = (spec.middleware ?? []) as Array<{ name?: string }>;
  process.stdout.write(`  middleware:  [${mw.map((m) => m.name ?? '(unnamed)').join(', ')}]\n`);
}

if (subagents.length !== 1 || subagents[0]?.name !== 'general-purpose') {
  process.stderr.write('\nFAIL: expected exactly one general-purpose sub-agent\n');
  process.exit(1);
}

const mwNames = ((subagents[0]?.middleware ?? []) as Array<{ name?: string }>).map((m) => m.name);
if (!mwNames.includes('geminiToolFilter')) {
  process.stderr.write(
    '\nFAIL: geminiToolFilter missing from general-purpose sub-agent middleware\n',
  );
  process.exit(1);
}

process.stdout.write('\nPASS: one general-purpose sub-agent with geminiToolFilter confirmed\n');
