import type { SubAgent } from 'deepagents';
import { geminiToolFilter } from './gemini-tool-filter.js';

// Ensures geminiToolFilter is in a sub-agent's middleware stack.
// The general-purpose sub-agent does NOT inherit parent middleware (mergeMiddlewareStack
// uses appendNew:false), so every sub-agent spec must carry the filter explicitly.
export function withGeminiCompat(spec: SubAgent): SubAgent {
  const existing = (spec.middleware ?? []) as unknown[];
  if (existing.includes(geminiToolFilter)) return spec;
  return {
    ...spec,
    middleware: [geminiToolFilter, ...existing],
  } as SubAgent;
}
