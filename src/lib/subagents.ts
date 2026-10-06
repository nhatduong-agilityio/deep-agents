import { GENERAL_PURPOSE_SUBAGENT, type SubAgent } from 'deepagents';

// Return contract: ≤150-word summary with exact source filenames and note paths.
// Does NOT write to /report/ — main agent synthesises from summaries.
const RESEARCH_SYSTEM_PROMPT =
  'You are a research assistant. Your job:\n' +
  '1. Read the corpus files you are asked about.\n' +
  '2. Write detailed notes to /notes/<topic>.md (the task will specify the filename).\n' +
  '3. Return a summary of ≤150 words. For every key point include the exact corpus filename:\n' +
  '     Source: <exact-corpus-filename.txt>\n' +
  '4. End your response with the exact path to the notes file:\n' +
  '     Notes: /notes/<topic>.md\n\n' +
  'IMPORTANT: Do NOT write anything to /report/. ' +
  'Your only write destination is /notes/. ' +
  'The main agent will synthesise findings from your summary.';

// Research sub-agent: corpus retrieval only.
// RC1 fix: filesystem middleware is NOT included here — it must be injected per-run in config-b.ts
// using makeFilesystemMiddleware(backendFactory, permissions) so the run's FilesystemBackend is
// used instead of the default StateBackend (which is empty per-thread and cannot serve corpus files).
export const RESEARCH_SUBAGENT: SubAgent = {
  name: 'research',
  description:
    'Reads corpus files, writes notes to /notes/, and returns a ≤150-word summary with ' +
    'exact source filenames. Use this sub-agent for corpus retrieval tasks.',
  systemPrompt: RESEARCH_SYSTEM_PROMPT,
  middleware: [],
};

// Sub-agent list shared by Config B (T-DA-04) and integration tests.
export const SUBAGENTS = [GENERAL_PURPOSE_SUBAGENT, RESEARCH_SUBAGENT];
