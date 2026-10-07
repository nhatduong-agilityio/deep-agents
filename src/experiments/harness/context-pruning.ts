import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

export interface PruneStats {
  messagesBefore: number;
  messagesAfter: number;
  tokensSavedEstimate: number;
}

// Returns a copy of messages with ToolMessages that are older than the last
// keepLastN AI→Tool interaction pairs removed.
// HumanMessages, SystemMessages, and AIMessages are always kept.
export function pruneOldToolResults(
  messages: unknown[],
  keepLastN: number,
): { pruned: unknown[]; stats: PruneStats } {
  // Identify indices of AIMessages that have tool_calls (each starts an interaction pair)
  const aiWithToolCallIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m instanceof AIMessage && (m.tool_calls?.length ?? 0) > 0) {
      aiWithToolCallIndices.push(i);
    }
  }

  // The tool call IDs in the pairs we want to KEEP (most recent keepLastN pairs)
  const keepFromPairIndex = Math.max(0, aiWithToolCallIndices.length - keepLastN);
  const keepStartIdx =
    aiWithToolCallIndices.length > 0 ? (aiWithToolCallIndices[keepFromPairIndex] ?? 0) : 0;

  // Collect tool_call_ids that must be kept (those in the kept AIMessages)
  const keepCallIds = new Set<string>();
  for (let i = keepFromPairIndex; i < aiWithToolCallIndices.length; i++) {
    const m = messages[aiWithToolCallIndices[i]!] as AIMessage;
    for (const tc of m.tool_calls ?? []) {
      if (tc.id) keepCallIds.add(tc.id);
    }
  }

  let tokensSavedEstimate = 0;
  const pruned = messages.filter((m, idx) => {
    if (m instanceof ToolMessage) {
      // Keep if its call_id is in the keepCallIds set OR if it's after keepStartIdx
      if (idx >= keepStartIdx || keepCallIds.has(m.tool_call_id)) return true;
      const contentLen =
        typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length;
      tokensSavedEstimate += Math.ceil(contentLen / 4);
      return false;
    }
    // Always keep non-ToolMessages
    return m instanceof HumanMessage || m instanceof SystemMessage || m instanceof AIMessage;
  });

  return {
    pruned,
    stats: {
      messagesBefore: messages.length,
      messagesAfter: pruned.length,
      tokensSavedEstimate,
    },
  };
}
