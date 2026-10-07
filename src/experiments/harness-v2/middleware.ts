import { createHash } from 'node:crypto';
import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';
import { pruneOldToolResults } from '../harness/context-pruning.js';
import { CONTEXT_PRUNE_KEEP_LAST_N } from './config.js';

// Middleware that intercepts run_tests calls and warns when identical code is re-submitted.
// Records a loopDetected flag accessible after the run.
export function makeLoopDetectionMiddleware() {
  const seenHashes = new Set<string>();
  let loopDetected = false;

  const mw = createMiddleware({
    name: 'LoopDetectionMiddleware',
    wrapToolCall: async (request, handler) => {
      if (request.toolCall.name !== 'run_tests') return handler(request);

      const args = request.toolCall.args as { code?: string };
      const code = args['code'] ?? '';
      const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);

      if (seenHashes.has(hash)) {
        loopDetected = true;
        return new ToolMessage({
          content:
            'Loop detected: this exact code was already tested. ' +
            'Your solution has the same bug — try a different algorithm or fix the edge case.',
          tool_call_id: request.toolCall.id ?? '',
        });
      }
      seenHashes.add(hash);
      return handler(request);
    },
  });

  return {
    mw,
    isLoopDetected: () => loopDetected,
    reset: () => {
      seenHashes.clear();
      loopDetected = false;
    },
  };
}

// Middleware that prunes old run_tests ToolMessages before each model call.
export function makeContextPruningMiddleware() {
  return createMiddleware({
    name: 'ContextPruningMiddleware',
    wrapModelCall: async (request, handler) => {
      const { pruned } = pruneOldToolResults(request.messages, CONTEXT_PRUNE_KEEP_LAST_N);
      return handler({ ...request, messages: pruned as BaseMessage[] });
    },
  });
}

// Middleware that appends a verification reminder to the system message if run_tests
// has not yet been called successfully during this conversation.
export function makePreCompletionMiddleware() {
  return createMiddleware({
    name: 'PreCompletionMiddleware',
    wrapModelCall: async (request, handler) => {
      // Check if run_tests was called and ALL public tests passed
      const hasPassingResult = request.messages.some(
        (m) =>
          m instanceof ToolMessage &&
          typeof m.content === 'string' &&
          m.content.includes('All') &&
          m.content.includes('PASSED'),
      );

      if (!hasPassingResult) {
        const reminder =
          'MANDATORY: You MUST call run_tests with your solution code before giving a final answer. ' +
          'Do not respond with code unless run_tests shows all tests passing.';
        return handler({
          ...request,
          systemMessage: request.systemMessage.concat(reminder),
        });
      }

      return handler(request);
    },
  });
}

// Extracts the last run_tests call's code from conversation messages.
// Returns null if no run_tests call found.
export function extractLastTestedCode(messages: unknown[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!(m instanceof AIMessage)) continue;
    const tc = m.tool_calls as Array<{ name: string; args?: Record<string, unknown> }> | undefined;
    for (const call of (tc ?? []).slice().reverse()) {
      if (call.name === 'run_tests') {
        return (call.args?.['code'] as string | undefined) ?? null;
      }
    }
  }
  return null;
}

// Extracts final code from agent's last AIMessage (the text response, not a tool call).
export function extractFinalCode(messages: unknown[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!(m instanceof AIMessage)) continue;
    const tc = m.tool_calls as unknown[] | undefined;
    if (tc && tc.length > 0) continue; // still in tool-calling mode
    const text = typeof m.content === 'string' ? m.content : '';
    if (!text.trim()) continue;

    // Strip markdown fences if present
    const fenceMatch = /```(?:javascript|js|typescript|ts)?\s*\n?([\s\S]+?)\n?```/i.exec(text);
    if (fenceMatch?.[1]) return fenceMatch[1].trim();
    return text.trim();
  }
  // Fallback: try last run_tests call code
  return extractLastTestedCode(messages);
}
