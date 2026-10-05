import { GENERAL_PURPOSE_SUBAGENT } from 'deepagents';
import { withGeminiCompat } from './with-gemini-compat.js';

// Sub-agent list shared by Config B (T-DA-04) and integration tests.
// Each spec carries geminiToolFilter explicitly — parent middleware is NOT
// inherited through task-tool spawning (mergeMiddlewareStack appendNew:false).
export const SUBAGENTS = [withGeminiCompat(GENERAL_PURPOSE_SUBAGENT)];
