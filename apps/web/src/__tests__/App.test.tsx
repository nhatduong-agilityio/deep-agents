import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { App } from '../App.js';
import '../theme.css';

// ─── mock factory ─────────────────────────────────────────────────────────────

type UseStreamReturn = ReturnType<typeof useStream>;

function makeDefaultStream() {
  return {
    messages: [] as (HumanMessage | AIMessage)[],
    toolCalls: [] as { name: string; args: unknown }[],
    isLoading: false,
    error: undefined as unknown,
    threadId: null as string | null,
    submit: vi.fn(),
    stop: vi.fn(),
    respond: vi.fn(),
    disconnect: vi.fn(),
    interrupt: undefined as unknown,
    subagents: new Map() as Map<string, unknown>,
    values: {} as Record<string, unknown>,
  };
}

function mockReturn(overrides: Partial<ReturnType<typeof makeDefaultStream>> = {}) {
  return { ...makeDefaultStream(), ...overrides } as unknown as UseStreamReturn;
}

vi.mock('@langchain/react', () => ({
  useStream: vi.fn(() => makeDefaultStream()),
}));

import { useStream } from '@langchain/react';
const mockUseStream = vi.mocked(useStream);

beforeEach(() => {
  mockUseStream.mockReturnValue(mockReturn());
});

// ─── 1. Structure & Landmarks ─────────────────────────────────────────────────

describe('Structure & Landmarks', () => {
  it('renders the h1 title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /policy analyst agent/i })).toBeDefined();
  });

  it('renders a header landmark', () => {
    render(<App />);
    expect(screen.getByRole('banner')).toBeDefined();
  });

  it('renders the message log region', () => {
    render(<App />);
    expect(screen.getByRole('log', { name: /message history/i })).toBeDefined();
  });

  it('renders thread ID inside the header when set', () => {
    mockUseStream.mockReturnValue(mockReturn({ threadId: 'thread-abc-123' }));
    render(<App />);
    const threadEl = screen.getByText(/thread-abc-123/);
    expect(threadEl).toBeDefined();
    expect(threadEl.closest('header')).not.toBeNull();
  });

  it('does not render thread ID when null', () => {
    render(<App />);
    expect(screen.queryByText(/thread-/)).toBeNull();
  });

  it('does not render agent-panels when todos and subagents are both empty', () => {
    render(<App />);
    // No panel headings should appear
    expect(screen.queryByText(/^Plan$/i)).toBeNull();
    expect(screen.queryByRole('region', { name: /sub-agent activity/i })).toBeNull();
  });

  it('renders agent-panels when todos are non-empty', () => {
    mockUseStream.mockReturnValue(
      mockReturn({ values: { todos: [{ content: 'Step 1', status: 'pending' }] } }),
    );
    render(<App />);
    expect(screen.getByRole('region', { name: /todo list/i })).toBeDefined();
  });

  it('renders agent-panels when subagents are non-empty', () => {
    const subagents = new Map([
      ['sa-1', { id: 'tc-1', name: 'researcher', status: 'running', taskInput: 'Find text' }],
    ]);
    mockUseStream.mockReturnValue(mockReturn({ subagents }));
    render(<App />);
    expect(screen.getByRole('region', { name: /sub-agent activity/i })).toBeDefined();
  });
});

// ─── 2. Empty State ───────────────────────────────────────────────────────────

describe('Empty state', () => {
  it('shows empty state when no messages and not loading', () => {
    render(<App />);
    expect(screen.getByText(/ready to analyze policy/i)).toBeDefined();
  });

  it('shows empty state hint text', () => {
    render(<App />);
    expect(screen.getByText(/EU AI Act, US Executive/i)).toBeDefined();
  });

  it('hides empty state when messages exist', () => {
    mockUseStream.mockReturnValue(
      mockReturn({ messages: [new HumanMessage({ content: 'Hi', id: 'h1' })] }),
    );
    render(<App />);
    expect(screen.queryByText(/ready to analyze policy/i)).toBeNull();
  });

  it('hides empty state while loading (streaming indicator shows instead)', () => {
    mockUseStream.mockReturnValue(mockReturn({ isLoading: true }));
    render(<App />);
    expect(screen.queryByText(/ready to analyze policy/i)).toBeNull();
    expect(screen.getByRole('status')).toBeDefined();
  });
});

// ─── 3. Message Bubbles ───────────────────────────────────────────────────────

describe('Message bubbles', () => {
  it('renders a human message', () => {
    mockUseStream.mockReturnValue(
      mockReturn({ messages: [new HumanMessage({ content: 'Hello agent', id: 'h1' })] }),
    );
    render(<App />);
    expect(screen.getByText('Hello agent')).toBeDefined();
  });

  it('renders an AI message', () => {
    mockUseStream.mockReturnValue(
      mockReturn({ messages: [new AIMessage({ content: 'Hello human', id: 'a1' })] }),
    );
    render(<App />);
    expect(screen.getByText('Hello human')).toBeDefined();
  });

  it('AI bubble is a div, not a span (block elements must not break layout)', () => {
    mockUseStream.mockReturnValue(
      mockReturn({ messages: [new AIMessage({ content: 'Check this', id: 'a1' })] }),
    );
    render(<App />);
    const bubble = screen.getByText('Check this').closest('.msg-bubble--ai');
    expect(bubble?.tagName.toLowerCase()).toBe('div');
  });

  it('human bubble is a div', () => {
    mockUseStream.mockReturnValue(
      mockReturn({ messages: [new HumanMessage({ content: 'My question', id: 'h1' })] }),
    );
    render(<App />);
    const bubble = screen.getByText('My question').closest('.msg-bubble--human');
    expect(bubble?.tagName.toLowerCase()).toBe('div');
  });

  it('renders multiple messages in order', () => {
    mockUseStream.mockReturnValue(
      mockReturn({
        messages: [
          new HumanMessage({ content: 'First', id: 'h1' }),
          new AIMessage({ content: 'Second', id: 'a1' }),
          new HumanMessage({ content: 'Third', id: 'h2' }),
        ],
      }),
    );
    render(<App />);
    const all = screen.getAllByText(/First|Second|Third/);
    expect(all).toHaveLength(3);
    expect(all[0].textContent).toBe('First');
    expect(all[1].textContent).toBe('Second');
    expect(all[2].textContent).toBe('Third');
  });

  it('renders OpenAI array content format [{type:"text", text:"..."}]', () => {
    mockUseStream.mockReturnValue(
      mockReturn({
        messages: [
          new AIMessage({
            content: [{ type: 'text', text: 'Array content works' }] as never,
            id: 'a1',
          }),
        ],
      }),
    );
    render(<App />);
    expect(screen.getByText('Array content works')).toBeDefined();
  });

  it('concatenates multiple text blocks from array content', () => {
    mockUseStream.mockReturnValue(
      mockReturn({
        messages: [
          new AIMessage({
            content: [
              { type: 'text', text: 'Part one. ' },
              { type: 'text', text: 'Part two.' },
            ] as never,
            id: 'a1',
          }),
        ],
      }),
    );
    render(<App />);
    // Both parts concatenated in one text node
    expect(screen.getByText(/Part one\. Part two\./)).toBeDefined();
  });

  it('filters out non-text blocks (e.g. tool_use) from array content', () => {
    mockUseStream.mockReturnValue(
      mockReturn({
        messages: [
          new AIMessage({
            content: [
              { type: 'tool_use', id: 'tc1', name: 'read_file', input: {} } as never,
              { type: 'text', text: 'Done.' },
            ] as never,
            id: 'a1',
          }),
        ],
      }),
    );
    render(<App />);
    expect(screen.getByText('Done.')).toBeDefined();
    expect(screen.queryByText('tool_use')).toBeNull();
    expect(screen.queryByText('read_file')).toBeNull();
  });

  it('does not render an AI bubble when content is empty (stop pressed before text arrives)', () => {
    mockUseStream.mockReturnValue(
      mockReturn({
        messages: [
          new HumanMessage({ content: 'Long question', id: 'h1' }),
          new AIMessage({ content: '', id: 'a1' }),
        ],
      }),
    );
    render(<App />);
    const log = screen.getByRole('log');
    // Empty AI message must not render a bubble
    expect(log.querySelectorAll('.msg-bubble--ai').length).toBe(0);
    expect(log.querySelectorAll('.msg-bubble--human').length).toBe(1);
  });

  it('does not render multiple empty bubbles from multiple stops', () => {
    mockUseStream.mockReturnValue(
      mockReturn({
        messages: [
          new HumanMessage({ content: 'Q1', id: 'h1' }),
          new AIMessage({ content: '', id: 'a1' }),
          new HumanMessage({ content: 'Q2', id: 'h2' }),
          new AIMessage({ content: '', id: 'a2' }),
        ],
      }),
    );
    render(<App />);
    const log = screen.getByRole('log');
    expect(log.querySelectorAll('.msg-bubble--ai').length).toBe(0);
    expect(log.querySelectorAll('.msg-bubble--human').length).toBe(2);
  });

  it('renders nothing for unknown message types', () => {
    // ToolMessage is not HumanMessage or AIMessage — should be skipped
    mockUseStream.mockReturnValue(
      mockReturn({
        messages: [new HumanMessage({ content: 'visible', id: 'h1' })],
      }),
    );
    render(<App />);
    const log = screen.getByRole('log');
    // Only one message row should be rendered
    const rows = log.querySelectorAll('.msg-row');
    expect(rows.length).toBe(1);
  });
});

// ─── 3b. Human bubble line breaks (issue #8, E1-01) ──────────────────────────

describe('Human bubble line breaks', () => {
  function renderHuman(content: string) {
    mockUseStream.mockReturnValue(
      mockReturn({ messages: [new HumanMessage({ content, id: 'h1' })] }),
    );
    render(<App />);
    return document.querySelector('.msg-bubble--human') as HTMLElement;
  }

  it('AC1: human bubble keeps line breaks (white-space: pre-wrap)', () => {
    const bubble = renderHuman('line one\nline two');
    expect(getComputedStyle(bubble).whiteSpace).toBe('pre-wrap');
  });

  it('AC2: human bubble wraps long unbroken strings (overflow-wrap: anywhere)', () => {
    const bubble = renderHuman(`https://example.com/${'a'.repeat(300)}`);
    expect(getComputedStyle(bubble).overflowWrap).toBe('anywhere');
  });

  it('AC3: human content is shown exactly as sent, without Markdown or HTML', () => {
    const content = '**bold**\n<b>x</b>\n# h\n- item';
    const bubble = renderHuman(content);
    expect(bubble.textContent).toBe(content);
    expect(bubble.querySelector('strong, b, h1, ul')).toBeNull();
  });

  it('AC4: AI bubble is unchanged (still Markdown, no pre-wrap)', () => {
    mockUseStream.mockReturnValue(
      mockReturn({ messages: [new AIMessage({ content: '**bold**', id: 'a1' })] }),
    );
    render(<App />);
    const bubble = document.querySelector('.msg-bubble--ai') as HTMLElement;
    expect(bubble.querySelector('strong')?.textContent).toBe('bold');
    expect(getComputedStyle(bubble).whiteSpace).not.toBe('pre-wrap');
  });
});

// ─── 4. Streaming Indicator ───────────────────────────────────────────────────

describe('Streaming indicator', () => {
  it('shown when isLoading is true', () => {
    mockUseStream.mockReturnValue(mockReturn({ isLoading: true }));
    render(<App />);
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('has accessible name "streaming"', () => {
    mockUseStream.mockReturnValue(mockReturn({ isLoading: true }));
    render(<App />);
    expect(screen.getByRole('status', { name: /streaming/i })).toBeDefined();
  });

  it('hidden when isLoading is false', () => {
    render(<App />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders three dot spans', () => {
    mockUseStream.mockReturnValue(mockReturn({ isLoading: true }));
    render(<App />);
    const indicator = screen.getByRole('status');
    expect(indicator.querySelectorAll('.msg-streaming-dot').length).toBe(3);
  });
});

// ─── 5. Form Interactions ─────────────────────────────────────────────────────

describe('Form interactions', () => {
  it('renders the message input', () => {
    render(<App />);
    expect(screen.getByRole('textbox', { name: /message input/i })).toBeDefined();
  });

  it('send button is disabled when input is empty', () => {
    render(<App />);
    const send = screen.getByRole('button', { name: /send/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it('send button is enabled when input has text', () => {
    render(<App />);
    const input = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(input, { target: { value: 'test' } });
    const send = screen.getByRole('button', { name: /send/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });

  it('calls submit with human message on form submit', () => {
    const submitMock = vi.fn();
    mockUseStream.mockReturnValue(mockReturn({ submit: submitMock }));
    render(<App />);
    const input = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(input, { target: { value: 'test question' } });
    fireEvent.submit(input.closest('form')!);
    expect(submitMock).toHaveBeenCalledWith({
      messages: [{ type: 'human', content: 'test question' }],
    });
  });

  it('clears the input after submit', () => {
    render(<App />);
    const input = screen.getByRole('textbox', { name: /message input/i }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'question' } });
    fireEvent.submit(input.closest('form')!);
    expect(input.value).toBe('');
  });

  it('does not submit when input is whitespace only', () => {
    const submitMock = vi.fn();
    mockUseStream.mockReturnValue(mockReturn({ submit: submitMock }));
    render(<App />);
    const input = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('does not submit when isLoading is true', () => {
    const submitMock = vi.fn();
    mockUseStream.mockReturnValue(mockReturn({ isLoading: true, submit: submitMock }));
    render(<App />);
    // Input is disabled when loading — simulate form submit anyway
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('input is disabled while loading', () => {
    mockUseStream.mockReturnValue(mockReturn({ isLoading: true }));
    render(<App />);
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(input.disabled).toBe(true);
  });

  it('shows Stop button while loading', () => {
    mockUseStream.mockReturnValue(mockReturn({ isLoading: true }));
    render(<App />);
    expect(screen.getByRole('button', { name: /stop/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /send/i })).toBeNull();
  });

  it('Stop button calls stop()', () => {
    const stopMock = vi.fn();
    mockUseStream.mockReturnValue(mockReturn({ isLoading: true, stop: stopMock }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(stopMock).toHaveBeenCalledOnce();
  });
});

// ─── 5b. Multi-line input (issue #1: "Line breaks are not possible") ─────────

describe('Multi-line input', () => {
  it('Enter without Shift sends the message', async () => {
    const user = userEvent.setup();
    const submitMock = vi.fn();
    mockUseStream.mockReturnValue(mockReturn({ submit: submitMock }));
    render(<App />);
    await user.type(screen.getByRole('textbox', { name: /message input/i }), 'line one');
    await user.keyboard('{Enter}');
    expect(submitMock).toHaveBeenCalledWith({ messages: [{ type: 'human', content: 'line one' }] });
  });

  it('Shift+Enter inserts a line break and does not send the message', async () => {
    const user = userEvent.setup();
    const submitMock = vi.fn();
    mockUseStream.mockReturnValue(mockReturn({ submit: submitMock }));
    render(<App />);
    const input = screen.getByRole('textbox', { name: /message input/i }) as HTMLTextAreaElement;
    await user.type(input, 'line one');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(submitMock, 'Shift+Enter must not send the message').not.toHaveBeenCalled();
    expect(input.value, 'Shift+Enter must insert a line break').toBe('line one\n');
  });

  it('sends a multi-line message with its line break', async () => {
    const user = userEvent.setup();
    const submitMock = vi.fn();
    mockUseStream.mockReturnValue(mockReturn({ submit: submitMock }));
    render(<App />);
    const input = screen.getByRole('textbox', { name: /message input/i });
    await user.type(input, 'line one');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(input, 'line two');
    await user.keyboard('{Enter}');
    expect(submitMock).toHaveBeenCalledWith({
      messages: [{ type: 'human', content: 'line one\nline two' }],
    });
  });

  it('Enter that confirms IME composition does not send the message', () => {
    const submitMock = vi.fn();
    mockUseStream.mockReturnValue(mockReturn({ submit: submitMock }));
    render(<App />);
    const input = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(input, { target: { value: 'xin chao' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(submitMock).not.toHaveBeenCalled();
  });

  // Safari fires the IME-confirming Enter after compositionend: isComposing is false, keyCode is 229.
  it('Safari-style IME Enter (keyCode 229) does not send the message', () => {
    const submitMock = vi.fn();
    mockUseStream.mockReturnValue(mockReturn({ submit: submitMock }));
    render(<App />);
    const input = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(input, { target: { value: 'xin chao' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: false });
    expect(submitMock).not.toHaveBeenCalled();
  });
});

// ─── 6. Interrupt Dialog ──────────────────────────────────────────────────────

describe('Interrupt dialog', () => {
  it('shown when interrupt is defined', () => {
    mockUseStream.mockReturnValue(mockReturn({ interrupt: { id: 'i1', value: 'Confirm write?' } }));
    render(<App />);
    expect(screen.getByRole('dialog', { name: /approval required/i })).toBeDefined();
  });

  it('not shown when interrupt is undefined', () => {
    render(<App />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('aria-labelledby links dialog to its title element', () => {
    mockUseStream.mockReturnValue(mockReturn({ interrupt: { id: 'i1', value: 'ok?' } }));
    render(<App />);
    const dialog = screen.getByRole('dialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const titleEl = document.getElementById(labelId!);
    expect(titleEl?.textContent).toMatch(/approval required/i);
  });

  it('displays string interrupt value', () => {
    mockUseStream.mockReturnValue(
      mockReturn({ interrupt: { id: 'i1', value: 'Write to /corpus/file.md?' } }),
    );
    render(<App />);
    expect(screen.getByText('Write to /corpus/file.md?')).toBeDefined();
  });

  it('displays object interrupt value as JSON', () => {
    mockUseStream.mockReturnValue(
      mockReturn({ interrupt: { id: 'i1', value: { action: 'delete', path: '/corpus' } } }),
    );
    render(<App />);
    expect(screen.getByText(/"action"/)).toBeDefined();
    expect(screen.getByText(/"delete"/)).toBeDefined();
  });

  it('Approve with no comment calls respond with {approved:true, comment:undefined}', () => {
    const respondMock = vi.fn();
    mockUseStream.mockReturnValue(
      mockReturn({ respond: respondMock, interrupt: { id: 'i1', value: 'ok?' } }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(respondMock).toHaveBeenCalledWith({ approved: true, comment: undefined });
  });

  it('Reject with no comment calls respond with {approved:false, comment:undefined}', () => {
    const respondMock = vi.fn();
    mockUseStream.mockReturnValue(
      mockReturn({ respond: respondMock, interrupt: { id: 'i1', value: 'ok?' } }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(respondMock).toHaveBeenCalledWith({ approved: false, comment: undefined });
  });

  it('Approve with a comment passes the comment in the payload', () => {
    const respondMock = vi.fn();
    mockUseStream.mockReturnValue(
      mockReturn({ respond: respondMock, interrupt: { id: 'i1', value: 'ok?' } }),
    );
    render(<App />);
    const commentInput = screen.getByRole('textbox', { name: /optional comment/i });
    fireEvent.change(commentInput, { target: { value: 'looks good' } });
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(respondMock).toHaveBeenCalledWith({ approved: true, comment: 'looks good' });
  });

  it('Reject with a comment passes the comment in the payload', () => {
    const respondMock = vi.fn();
    mockUseStream.mockReturnValue(
      mockReturn({ respond: respondMock, interrupt: { id: 'i1', value: 'ok?' } }),
    );
    render(<App />);
    const commentInput = screen.getByRole('textbox', { name: /optional comment/i });
    fireEvent.change(commentInput, { target: { value: 'too risky' } });
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(respondMock).toHaveBeenCalledWith({ approved: false, comment: 'too risky' });
  });

  it('comment input is cleared after Approve', () => {
    const respondMock = vi.fn();
    mockUseStream.mockReturnValue(
      mockReturn({ respond: respondMock, interrupt: { id: 'i1', value: 'ok?' } }),
    );
    render(<App />);
    const commentInput = screen.getByRole('textbox', {
      name: /optional comment/i,
    }) as HTMLInputElement;
    fireEvent.change(commentInput, { target: { value: 'note' } });
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(commentInput.value).toBe('');
  });

  it('comment input is cleared after Reject', () => {
    const respondMock = vi.fn();
    mockUseStream.mockReturnValue(
      mockReturn({ respond: respondMock, interrupt: { id: 'i1', value: 'ok?' } }),
    );
    render(<App />);
    const commentInput = screen.getByRole('textbox', {
      name: /optional comment/i,
    }) as HTMLInputElement;
    fireEvent.change(commentInput, { target: { value: 'note' } });
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(commentInput.value).toBe('');
  });
});

// ─── 7. Error Display ─────────────────────────────────────────────────────────

describe('Error display', () => {
  it('shows THREAD_BUDGET_EXCEEDED as friendly message', () => {
    mockUseStream.mockReturnValue(mockReturn({ error: { code: 'THREAD_BUDGET_EXCEEDED' } }));
    render(<App />);
    expect(
      screen.getByText('This conversation has reached its cost limit — please start a new thread.'),
    ).toBeDefined();
  });

  it('handles nested THREAD_BUDGET_EXCEEDED code', () => {
    mockUseStream.mockReturnValue(
      mockReturn({ error: { error: { code: 'THREAD_BUDGET_EXCEEDED' } } }),
    );
    render(<App />);
    expect(
      screen.getByText('This conversation has reached its cost limit — please start a new thread.'),
    ).toBeDefined();
  });

  it('shows generic error message for unknown Error instances', () => {
    mockUseStream.mockReturnValue(mockReturn({ error: new Error('network failure') }));
    render(<App />);
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/network failure/i)).toBeDefined();
  });

  it('shows reconnect button for network-like errors', () => {
    mockUseStream.mockReturnValue(mockReturn({ error: new Error('SSE connection dropped') }));
    render(<App />);
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeDefined();
  });

  it('does not show reconnect button for non-network errors', () => {
    mockUseStream.mockReturnValue(mockReturn({ error: new Error('JSON parse error') }));
    render(<App />);
    expect(screen.queryByRole('button', { name: /reconnect/i })).toBeNull();
  });

  it('reconnect button calls disconnect()', () => {
    const disconnectMock = vi.fn();
    mockUseStream.mockReturnValue(
      mockReturn({ error: new Error('fetch failed'), disconnect: disconnectMock }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /reconnect/i }));
    expect(disconnectMock).toHaveBeenCalledOnce();
  });

  it('no error box when error is undefined', () => {
    render(<App />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ─── 8. Tool Calls ────────────────────────────────────────────────────────────

describe('Tool calls', () => {
  it('shows tool-call disclosure when toolCalls non-empty', () => {
    mockUseStream.mockReturnValue(
      mockReturn({
        toolCalls: [{ name: 'read_file', args: { file_path: '/corpus/eu.txt' } }],
      }),
    );
    render(<App />);
    expect(screen.getByText(/tool calls \(1\)/i)).toBeDefined();
  });

  it('shows count for multiple tool calls', () => {
    mockUseStream.mockReturnValue(
      mockReturn({
        toolCalls: [
          { name: 'read_file', args: { file_path: '/a.txt' } },
          { name: 'write_file', args: { file_path: '/b.txt', content: '' } },
          { name: 'ls', args: { dir: '/' } },
        ],
      }),
    );
    render(<App />);
    expect(screen.getByText(/tool calls \(3\)/i)).toBeDefined();
  });

  it('no tool-call section when toolCalls is empty', () => {
    render(<App />);
    expect(screen.queryByText(/tool calls/i)).toBeNull();
  });
});

// ─── 9. Sub-agents Panel ─────────────────────────────────────────────────────

describe('Sub-agents', () => {
  it('shows sub-agent activity when subagents map is non-empty', () => {
    const subagents = new Map([
      [
        'sa-1',
        { id: 'tc-1', name: 'researcher', status: 'running', taskInput: 'Find EU AI Act text' },
      ],
    ]);
    mockUseStream.mockReturnValue(mockReturn({ subagents }));
    render(<App />);
    expect(screen.getByRole('region', { name: /sub-agent activity/i })).toBeDefined();
    expect(screen.getByText('researcher')).toBeDefined();
  });

  it('hides sub-agent panel when subagents map is empty', () => {
    render(<App />);
    expect(screen.queryByRole('region', { name: /sub-agent activity/i })).toBeNull();
  });

  it('status dot has aria-label matching status', () => {
    const subagents = new Map([
      ['sa-1', { id: 'tc-1', name: 'writer', status: 'complete', taskInput: null }],
    ]);
    mockUseStream.mockReturnValue(mockReturn({ subagents }));
    render(<App />);
    expect(screen.getByLabelText('complete')).toBeDefined();
  });

  it('shows task input text when provided', () => {
    const subagents = new Map([
      [
        'sa-1',
        { id: 'tc-1', name: 'retriever', status: 'running', taskInput: 'Find Article 6 text' },
      ],
    ]);
    mockUseStream.mockReturnValue(mockReturn({ subagents }));
    render(<App />);
    expect(screen.getByText(/Find Article 6 text/)).toBeDefined();
  });

  it('truncates task input to 60 characters', () => {
    const longInput = 'X'.repeat(80);
    const subagents = new Map([
      ['sa-1', { id: 'tc-1', name: 'retriever', status: 'running', taskInput: longInput }],
    ]);
    mockUseStream.mockReturnValue(mockReturn({ subagents }));
    render(<App />);
    expect(screen.queryByText(longInput)).toBeNull();
    expect(screen.getByText(new RegExp('X'.repeat(60)))).toBeDefined();
  });

  it('shows multiple sub-agents', () => {
    const subagents = new Map([
      ['sa-1', { id: 'tc-1', name: 'researcher', status: 'complete', taskInput: null }],
      ['sa-2', { id: 'tc-2', name: 'writer', status: 'running', taskInput: null }],
    ]);
    mockUseStream.mockReturnValue(mockReturn({ subagents }));
    render(<App />);
    expect(screen.getByText('researcher')).toBeDefined();
    expect(screen.getByText('writer')).toBeDefined();
  });
});

// ─── 10. Todo Panel ───────────────────────────────────────────────────────────

describe('Todo panel (via values.todos)', () => {
  it('shows todo panel when values.todos is non-empty', () => {
    mockUseStream.mockReturnValue(
      mockReturn({
        values: {
          todos: [
            { content: 'Read corpus', status: 'completed' },
            { content: 'Write summary', status: 'in_progress' },
          ],
        },
      }),
    );
    render(<App />);
    expect(screen.getByRole('region', { name: /todo list/i })).toBeDefined();
    expect(screen.getByText('Read corpus')).toBeDefined();
    expect(screen.getByText('Write summary')).toBeDefined();
  });

  it('hides todo panel when todos is empty array', () => {
    mockUseStream.mockReturnValue(mockReturn({ values: { todos: [] } }));
    render(<App />);
    expect(screen.queryByRole('region', { name: /todo list/i })).toBeNull();
  });

  it('hides todo panel when todos is not in values', () => {
    render(<App />);
    expect(screen.queryByRole('region', { name: /todo list/i })).toBeNull();
  });
});

// ─── 11. Files Panel ─────────────────────────────────────────────────────────

describe('Files panel (via values.files)', () => {
  it('shows files panel when values.files has report entries', () => {
    mockUseStream.mockReturnValue(
      mockReturn({
        values: {
          files: {
            '/report/summary.md': {
              content: '# Summary',
              mimeType: 'text/markdown',
              created_at: '2026-10-08T10:00:00Z',
              modified_at: '2026-10-08T10:00:00Z',
            },
          },
        },
      }),
    );
    render(<App />);
    expect(screen.getByRole('region', { name: /report files/i })).toBeDefined();
  });

  it('files panel not shown when no report files', () => {
    mockUseStream.mockReturnValue(
      mockReturn({
        values: {
          files: {
            '/notes/scratch.md': {
              content: 'notes',
              mimeType: 'text/plain',
              created_at: '',
              modified_at: '',
            },
          },
        },
      }),
    );
    render(<App />);
    expect(screen.queryByRole('region', { name: /report files/i })).toBeNull();
  });

  it('files panel not shown when files is empty', () => {
    render(<App />);
    expect(screen.queryByRole('region', { name: /report files/i })).toBeNull();
  });
});
