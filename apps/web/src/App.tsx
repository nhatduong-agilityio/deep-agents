import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStream } from '@langchain/react';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { TodoPanel } from './TodoPanel.js';
import { FilesPanel } from './FilesPanel.js';

// Vite proxy at /api injects the auth header server-side; never expose auth tokens in the bundle.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:2024';
const BUDGET_EXCEEDED_CODE = 'THREAD_BUDGET_EXCEEDED';
const BUDGET_EXCEEDED_MSG =
  'This conversation has reached its cost limit — please start a new thread.';

function isBudgetExceeded(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  if (code === BUDGET_EXCEEDED_CODE) return true;
  const inner = (error as Record<string, unknown>)['error'];
  if (inner && typeof inner === 'object') {
    return (inner as Record<string, unknown>)['code'] === BUDGET_EXCEEDED_CODE;
  }
  return false;
}

function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return /network|fetch|connection|sse|stream/i.test(msg);
}

const SESSION_THREAD_KEY = 'deep-agents-thread';

function getStoredThreadId(): string | undefined {
  return sessionStorage.getItem(SESSION_THREAD_KEY) ?? undefined;
}

function storeThreadId(id: string) {
  sessionStorage.setItem(SESSION_THREAD_KEY, id);
}

function clearStoredThreadId() {
  sessionStorage.removeItem(SESSION_THREAD_KEY);
}

// OpenAI returns content as [{type:'text', text:'...'}] blocks, not a plain string.
function flattenContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as { type?: string; text?: string }[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
}

function subagentDotClass(status: string): string {
  if (status === 'running') return 'subagent-dot subagent-dot--running';
  if (status === 'complete') return 'subagent-dot subagent-dot--complete';
  return 'subagent-dot subagent-dot--error';
}

export function App() {
  const [input, setInput] = useState('');
  const [interruptResponse, setInterruptResponse] = useState('');

  // Thread ID from sessionStorage — cleared automatically when the tab closes,
  // so stale IDs from previous dev sessions never survive into a new session.
  const [effectiveThreadId] = useState<string | undefined>(getStoredThreadId);

  const stream = useStream({
    apiUrl: API_URL,
    assistantId: 'agent',
    threadId: effectiveThreadId,
  });

  const {
    messages,
    toolCalls,
    isLoading,
    error,
    threadId,
    submit,
    stop,
    respond,
    interrupt,
    subagents,
    values,
    disconnect,
  } = stream;

  // Persist threadId in sessionStorage after first run so page-refreshes resume the same thread.
  useEffect(() => {
    if (threadId) storeThreadId(threadId);
  }, [threadId]);

  // Auto-scroll message log to bottom on new messages.
  const messageLogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = messageLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Move focus into the interrupt dialog when it appears.
  const interruptInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (interrupt) interruptInputRef.current?.focus();
  }, [interrupt]);

  const subagentList = useMemo(() => Array.from(subagents.values()), [subagents]);
  const todos = useMemo(() => (values as Record<string, unknown> | undefined)?.['todos'], [values]);
  const files = useMemo(() => (values as Record<string, unknown> | undefined)?.['files'], [values]);

  const hasPanels = (Array.isArray(todos) && todos.length > 0) || subagentList.length > 0;

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || isLoading) return;
      setInput('');
      void submit({ messages: [{ type: 'human', content: text }] });
    },
    [input, isLoading, submit],
  );

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter inserts a newline; skip Enter that confirms IME composition (keyCode 229 for Safari).
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      e.nativeEvent.keyCode !== 229
    ) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }, []);

  const handleApprove = useCallback(() => {
    void respond({ approved: true, comment: interruptResponse.trim() || undefined });
    setInterruptResponse('');
  }, [respond, interruptResponse]);

  const handleReject = useCallback(() => {
    void respond({ approved: false, comment: interruptResponse.trim() || undefined });
    setInterruptResponse('');
  }, [respond, interruptResponse]);

  const handleReconnect = useCallback(() => void disconnect(), [disconnect]);

  // Clear stored thread when budget is exceeded so "new thread" actually starts fresh.
  useEffect(() => {
    if (isBudgetExceeded(error)) clearStoredThreadId();
  }, [error]);

  const errorMsg = isBudgetExceeded(error)
    ? BUDGET_EXCEEDED_MSG
    : error
      ? String(error instanceof Error ? error.message : error)
      : null;

  return (
    <div className="agent-app">
      {/* ── Header ── */}
      <header className="agent-header">
        <h1 className="agent-title">Policy Analyst Agent</h1>
        {threadId && <p className="agent-thread-id">{threadId}</p>}
      </header>

      {/* ── Status panels — only when agent is actively working ── */}
      {hasPanels && (
        <div className="agent-panels">
          <TodoPanel todos={Array.isArray(todos) ? todos : []} />
          {subagentList.length > 0 && (
            <section aria-label="sub-agent activity" className="subagent-section">
              <h2 className="subagent-heading">Sub-agents</h2>
              <ul className="subagent-list">
                {subagentList.map((sa) => (
                  <li key={sa.id} className="subagent-item">
                    <span className={subagentDotClass(sa.status)} aria-label={sa.status} />
                    <strong>{sa.name}</strong>
                    {sa.taskInput ? ` — ${sa.taskInput.slice(0, 60)}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* ── Message log — fills all remaining space ── */}
      <div ref={messageLogRef} role="log" aria-label="message history" className="message-log">
        {/* Empty state */}
        {messages.length === 0 && !isLoading && (
          <div className="msg-empty">
            <div className="msg-empty-icon" aria-hidden="true" />
            <p className="msg-empty-title">Ready to analyze policy</p>
            <p className="msg-empty-hint">
              Ask about the EU AI Act, US Executive Orders on AI, or any regulatory compliance
              question.
            </p>
          </div>
        )}

        {/* Message bubbles — div, not span, because Markdown renders block elements */}
        {messages.map((msg, i) => {
          const isHuman = msg instanceof HumanMessage;
          const isAI = msg instanceof AIMessage;
          if (!isHuman && !isAI) return null;
          const content = flattenContent(msg.content);
          if (!content.trim()) return null;
          return (
            <div
              key={msg.id ?? i}
              className={`msg-row ${isHuman ? 'msg-row--human' : 'msg-row--ai'}`}
            >
              <div className={`msg-bubble ${isHuman ? 'msg-bubble--human' : 'msg-bubble--ai'}`}>
                {isAI ? <Markdown remarkPlugins={[remarkBreaks]}>{content}</Markdown> : content}
              </div>
            </div>
          );
        })}

        {/* Streaming — role="status" allows aria-label; implicit aria-live="polite" */}
        {isLoading && (
          <div role="status" aria-label="streaming" className="msg-streaming">
            <span className="msg-streaming-dot" />
            <span className="msg-streaming-dot" />
            <span className="msg-streaming-dot" />
          </div>
        )}
      </div>

      {/* ── Footer — tool calls, files, interrupt, error, form ── */}
      <div className="chat-footer">
        {toolCalls.length > 0 && (
          <details className="tool-calls-details">
            <summary className="tool-calls-summary">Tool calls ({toolCalls.length})</summary>
            <pre className="tool-calls-pre">
              {JSON.stringify(
                toolCalls.map((tc) => ({ name: tc.name, args: tc.args })),
                null,
                2,
              )}
            </pre>
          </details>
        )}

        <FilesPanel
          files={
            typeof files === 'object' && files !== null ? (files as Record<string, never>) : {}
          }
        />

        {interrupt && (
          <div
            role="dialog"
            aria-labelledby="interrupt-dialog-title"
            aria-modal="true"
            className="interrupt-dialog"
          >
            <p id="interrupt-dialog-title" className="interrupt-title">
              Agent paused — approval required
            </p>
            {interrupt.value !== undefined && (
              <pre className="interrupt-pre">
                {typeof interrupt.value === 'string'
                  ? interrupt.value
                  : JSON.stringify(interrupt.value, null, 2)}
              </pre>
            )}
            <input
              ref={interruptInputRef}
              aria-label="Optional comment"
              value={interruptResponse}
              onChange={(e) => setInterruptResponse(e.target.value)}
              placeholder="Optional comment…"
              className="input-text"
            />
            <div className="interrupt-actions">
              <button type="button" onClick={handleApprove} className="btn btn--approve">
                Approve
              </button>
              <button type="button" onClick={handleReject} className="btn btn--reject">
                Reject
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div role="alert" className="error-box">
            <span>{errorMsg}</span>
            {isNetworkError(error) && (
              <button
                type="button"
                aria-label="Reconnect"
                onClick={handleReconnect}
                className="btn btn--ghost"
              >
                Reconnect
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="chat-form">
          {/* textarea, not input: a single-line input submits on any Enter and drops line breaks. */}
          <textarea
            aria-label="Message input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={isLoading}
            placeholder="Ask a policy question…"
            className="input-text"
          />
          {isLoading ? (
            <button type="button" onClick={() => void stop()} className="btn btn--stop">
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="btn btn--send">
              Send
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
