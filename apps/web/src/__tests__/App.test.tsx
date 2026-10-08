import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { App } from '../App.js';

// Minimal UseStreamReturn shape required by App — cast via unknown to bypass strict overlap check.
function mockReturn(overrides: Partial<ReturnType<typeof makeDefaultStream>> = {}) {
  return { ...makeDefaultStream(), ...overrides } as unknown as ReturnType<typeof useStream>;
}

function makeDefaultStream() {
  return {
    messages: [] as (HumanMessage | AIMessage)[],
    toolCalls: [] as { name: string; args: unknown }[],
    isLoading: false,
    error: undefined as unknown,
    threadId: null as string | null,
    submit: vi.fn(),
    stop: vi.fn(),
  };
}

vi.mock('@langchain/react', () => ({
  useStream: vi.fn(() => makeDefaultStream()),
}));

import { useStream } from '@langchain/react';
const mockUseStream = vi.mocked(useStream);

beforeEach(() => {
  mockUseStream.mockReturnValue(mockReturn());
});

describe('App', () => {
  it('renders input and send button', () => {
    render(<App />);
    expect(screen.getByRole('textbox', { name: /message input/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /send/i })).toBeDefined();
  });

  it('disables input and shows stop button while loading', () => {
    mockUseStream.mockReturnValue(mockReturn({ isLoading: true }));
    render(<App />);
    const input = screen.getByRole('textbox');
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /stop/i })).toBeDefined();
  });

  it('renders user and assistant messages', () => {
    mockUseStream.mockReturnValue(
      mockReturn({
        messages: [
          new HumanMessage({ content: 'Hello agent', id: 'h1' }),
          new AIMessage({ content: 'Hello human', id: 'a1' }),
        ],
      }),
    );
    render(<App />);
    expect(screen.getByText('Hello agent')).toBeDefined();
    expect(screen.getByText('Hello human')).toBeDefined();
  });

  it('shows THREAD_BUDGET_EXCEEDED as friendly message', () => {
    mockUseStream.mockReturnValue(mockReturn({ error: { code: 'THREAD_BUDGET_EXCEEDED' } }));
    render(<App />);
    expect(
      screen.getByText('This conversation has reached its cost limit — please start a new thread.'),
    ).toBeDefined();
  });

  it('shows nested THREAD_BUDGET_EXCEEDED code', () => {
    mockUseStream.mockReturnValue(
      mockReturn({ error: { error: { code: 'THREAD_BUDGET_EXCEEDED' } } }),
    );
    render(<App />);
    expect(
      screen.getByText('This conversation has reached its cost limit — please start a new thread.'),
    ).toBeDefined();
  });

  it('shows generic error message for unknown errors', () => {
    mockUseStream.mockReturnValue(mockReturn({ error: new Error('network failure') }));
    render(<App />);
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/network failure/i)).toBeDefined();
  });

  it('displays thread ID when available', () => {
    mockUseStream.mockReturnValue(mockReturn({ threadId: 'thread-abc-123' }));
    render(<App />);
    expect(screen.getByText(/thread-abc-123/)).toBeDefined();
  });

  it('shows tool-call disclosure when toolCalls non-empty', () => {
    mockUseStream.mockReturnValue(
      mockReturn({
        toolCalls: [{ name: 'read_file', args: { file_path: '/corpus/eu.txt' } }],
      }),
    );
    render(<App />);
    expect(screen.getByText(/tool calls \(1\)/i)).toBeDefined();
  });

  it('calls submit with human message on form submit', () => {
    const submitMock = vi.fn();
    mockUseStream.mockReturnValue(mockReturn({ submit: submitMock }));
    render(<App />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test question' } });
    fireEvent.submit(input.closest('form')!);
    expect(submitMock).toHaveBeenCalledWith({
      messages: [{ type: 'human', content: 'test question' }],
    });
  });
});
