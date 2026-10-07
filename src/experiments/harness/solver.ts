import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ChatOpenAI } from '@langchain/openai';
import type { Problem } from '../../../benchmark/subset/problems.js';
import { pruneOldToolResults } from './context-pruning.js';
import type { HarnessStepId } from './harness-config.js';
import { CONTEXT_PRUNE_KEEP_LAST_N } from './harness-config.js';

export interface SolveResult {
  code: string | null;
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  thinkUsed: boolean;
}

const BASE_SYSTEM = `You are a JavaScript coding expert. Solve the given algorithmic problem.

Rules:
- Respond ONLY with the function body (the code inside the function, not the function declaration).
- Do NOT include the function keyword, function name, or parameters in your response.
- Do NOT include any explanation, markdown fences, or comments — only the raw function body.
- The harness will wrap your response in: function ${'{functionName}'}(${'{params}'}) { <your code> }
- Handle all edge cases shown in the examples.`;

const THINK_SYSTEM = `${BASE_SYSTEM}

Before writing your solution, first write a brief analysis starting with "THINK:" on its own line.
Cover: (1) algorithm choice, (2) edge cases to handle, (3) expected time complexity.
Then write "SOLUTION:" on its own line followed by the function body only.`;

const CHECKLIST_INJECTION = `Before finalising your solution, verify:
1. Does it handle empty input (empty array, empty string, n=0)?
2. Does it handle single-element input?
3. Does it return the correct type?
4. Are there off-by-one risks?

Now write the function body only (no declaration, no fences):`;

const REWOO_SYSTEM = `${BASE_SYSTEM}

You MUST first write a numbered plan with exactly these steps:
PLAN:
1. <understand the problem>
2. <choose algorithm>
3. <handle edge cases>
4. <write the code>

Then write "SOLUTION:" followed by the function body only.`;

function extractCode(response: string, stepId: HarnessStepId): string {
  // For think/rewoo steps, extract the SOLUTION: section
  if (stepId === 'think' || stepId === 'rewoo') {
    const solutionMatch = /SOLUTION:\s*\n([\s\S]+)$/i.exec(response.trim());
    if (solutionMatch?.[1]) return solutionMatch[1].trim();
  }
  // Strip any accidental markdown fences
  const fenceMatch = /```(?:javascript|js|typescript|ts)?\s*\n?([\s\S]+?)\n?```/i.exec(response);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  return response.trim();
}

export async function solveProblem(
  model: ChatOpenAI,
  problem: Problem,
  stepId: HarnessStepId,
): Promise<SolveResult> {
  let systemContent = BASE_SYSTEM.replace('{functionName}', problem.functionName).replace(
    '{params}',
    problem.paramNames.join(', '),
  );

  if (stepId === 'think') {
    systemContent = THINK_SYSTEM.replace('{functionName}', problem.functionName).replace(
      '{params}',
      problem.paramNames.join(', '),
    );
  } else if (stepId === 'rewoo') {
    systemContent = REWOO_SYSTEM.replace('{functionName}', problem.functionName).replace(
      '{params}',
      problem.paramNames.join(', '),
    );
  }

  const userContent =
    stepId === 'checklist'
      ? `${problem.description}\n\nFunction signature: function ${problem.functionName}(${problem.paramNames.join(', ')})\n\n${CHECKLIST_INJECTION}`
      : `${problem.description}\n\nFunction signature: function ${problem.functionName}(${problem.paramNames.join(', ')})`;

  let messages: (SystemMessage | HumanMessage | AIMessage)[] = [
    new SystemMessage(systemContent),
    new HumanMessage(userContent),
  ];

  let inputTokens = 0;
  let outputTokens = 0;
  let modelCalls = 0;

  // Context pruning step: prune before the model call
  if (stepId === 'context-pruning') {
    const { pruned } = pruneOldToolResults(messages, CONTEXT_PRUNE_KEEP_LAST_N);
    messages = pruned as typeof messages;
  }

  const response = await model.invoke(messages);
  modelCalls++;
  inputTokens += response.usage_metadata?.input_tokens ?? 0;
  outputTokens += response.usage_metadata?.output_tokens ?? 0;

  const responseText =
    typeof response.content === 'string'
      ? response.content
      : Array.isArray(response.content)
        ? response.content
            .map((c) => (typeof c === 'string' ? c : ((c as { text?: string }).text ?? '')))
            .join('')
        : '';

  const thinkUsed =
    stepId === 'think'
      ? /^THINK:/im.test(responseText)
      : stepId === 'rewoo'
        ? /^PLAN:/im.test(responseText)
        : false;

  const code = extractCode(responseText, stepId);

  return { code: code || null, inputTokens, outputTokens, modelCalls, thinkUsed };
}
