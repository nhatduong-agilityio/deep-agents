import { createMiddleware } from 'langchain';

// grep's max_count uses Zod .positive() → exclusiveMinimum in JSON Schema,
// which the Gemini API rejects with 400. Filter it out until deepagents fixes the schema.
const GEMINI_BROKEN_TOOLS = new Set(['grep']);

export const geminiToolFilter = createMiddleware({
  name: 'geminiToolFilter',
  wrapModelCall: async (request, handler) => {
    const filtered = (request.tools ?? []).filter(
      (t) => !GEMINI_BROKEN_TOOLS.has(t.name as string),
    );
    return handler({ ...request, tools: filtered });
  },
});
