import { useState } from 'react';
import { useStream } from '@langchain/react';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import Markdown from 'react-markdown';

const API_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:2024';
const BUDGET_EXCEEDED_CODE = 'THREAD_BUDGET_EXCEEDED';
const BUDGET_EXCEEDED_MSG =
  'This conversation has reached its cost limit — please start a new thread.';

function isBudgetExceeded(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  if (code === BUDGET_EXCEEDED_CODE) return true;
  // also check nested error.error.code (langgraph-sdk wraps the code)
  const inner = (error as Record<string, unknown>)['error'];
  if (inner && typeof inner === 'object') {
    return (inner as Record<string, unknown>)['code'] === BUDGET_EXCEEDED_CODE;
  }
  return false;
}

export function App() {
  const [input, setInput] = useState('');

  const stream = useStream({
    apiUrl: API_URL,
    assistantId: 'agent',
  });

  const { messages, toolCalls, isLoading, error, threadId, submit, stop } = stream;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    void submit({ messages: [{ type: 'human', content: text }] });
  }

  const errorMsg = isBudgetExceeded(error)
    ? BUDGET_EXCEEDED_MSG
    : error
      ? String(error instanceof Error ? error.message : error)
      : null;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Policy Analyst Agent</h1>

      {/* Feature 7 — thread ID */}
      {threadId && (
        <p style={{ fontSize: '0.75rem', color: '#888', margin: '0 0 0.75rem' }}>
          Thread: {threadId}
        </p>
      )}

      {/* Feature 2 — message history */}
      <div
        role="log"
        aria-label="message history"
        style={{
          border: '1px solid #ddd',
          borderRadius: 6,
          padding: '0.75rem',
          minHeight: 200,
          maxHeight: 480,
          overflowY: 'auto',
          marginBottom: '0.75rem',
          background: '#fafafa',
        }}
      >
        {messages.map((msg, i) => {
          const isHuman = msg instanceof HumanMessage;
          const isAI = msg instanceof AIMessage;
          if (!isHuman && !isAI) return null;
          const content = typeof msg.content === 'string' ? msg.content : '';
          return (
            <div
              key={msg.id ?? i}
              style={{
                marginBottom: '0.75rem',
                textAlign: isHuman ? 'right' : 'left',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  background: isHuman ? '#0066cc' : '#fff',
                  color: isHuman ? '#fff' : '#222',
                  border: isHuman ? 'none' : '1px solid #ddd',
                  borderRadius: 8,
                  padding: '0.4rem 0.75rem',
                  maxWidth: '80%',
                  textAlign: 'left',
                }}
              >
                {/* markdown rendered with react-markdown — no raw HTML in DOM */}
                {isAI ? <Markdown>{content}</Markdown> : content}
              </span>
            </div>
          );
        })}

        {/* Feature 3 — streaming indicator */}
        {isLoading && (
          <div style={{ color: '#888', fontSize: '0.875rem' }} aria-label="streaming">
            ···
          </div>
        )}
      </div>

      {/* Feature 5 — tool-call disclosure */}
      {toolCalls.length > 0 && (
        <details style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>
          <summary style={{ cursor: 'pointer', color: '#555' }}>
            Tool calls ({toolCalls.length})
          </summary>
          <pre
            style={{
              background: '#f4f4f4',
              padding: '0.5rem',
              borderRadius: 4,
              overflowX: 'auto',
              marginTop: '0.25rem',
            }}
          >
            {JSON.stringify(
              toolCalls.map((tc) => ({ name: tc.name, args: tc.args })),
              null,
              2,
            )}
          </pre>
        </details>
      )}

      {/* Feature 6 — error display */}
      {errorMsg && (
        <div
          role="alert"
          style={{
            background: '#fff0f0',
            border: '1px solid #f99',
            borderRadius: 6,
            padding: '0.5rem 0.75rem',
            marginBottom: '0.75rem',
            fontSize: '0.875rem',
            color: '#c00',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Feature 1 — chat input + Feature 4 — stop button */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          aria-label="message input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          placeholder="Ask a policy question…"
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            borderRadius: 6,
            border: '1px solid #ccc',
            fontSize: '1rem',
          }}
        />
        {isLoading ? (
          <button
            type="button"
            onClick={() => void stop()}
            style={{ padding: '0.5rem 1rem', borderRadius: 6, cursor: 'pointer' }}
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            style={{ padding: '0.5rem 1rem', borderRadius: 6, cursor: 'pointer' }}
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
