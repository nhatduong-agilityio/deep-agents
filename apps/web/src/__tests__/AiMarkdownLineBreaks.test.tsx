import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { AIMessage } from '@langchain/core/messages';
import { App } from '../App.js';
import '../theme.css';

// ─── mock factory (same shape as App.test.tsx) ────────────────────────────────

type UseStreamReturn = ReturnType<typeof useStream>;

function makeDefaultStream() {
  return {
    messages: [] as AIMessage[],
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

function renderAi(content: string) {
  mockUseStream.mockReturnValue(mockReturn({ messages: [new AIMessage({ content, id: 'a1' })] }));
  render(<App />);
  return document.querySelector('.msg-bubble--ai') as HTMLElement;
}

// ─── E1-03: AI (Markdown) line breaks ─────────────────────────────────────────

describe('AI bubble Markdown line breaks (E1-03)', () => {
  it('AC1: a single \\n becomes a <br> inside one paragraph', () => {
    const bubble = renderAi('line one\nline two');
    const paragraphs = bubble.querySelectorAll('p');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].querySelectorAll('br')).toHaveLength(1);
    expect(paragraphs[0].textContent).toContain('line one');
    expect(paragraphs[0].textContent).toContain('line two');
  });

  it('AC2: \\n\\n gives two paragraphs and no <br>', () => {
    const bubble = renderAi('para one\n\npara two');
    const paragraphs = bubble.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe('para one');
    expect(paragraphs[1].textContent).toBe('para two');
    expect(bubble.querySelector('br')).toBeNull();
  });

  it('AC3: a list still renders as <ul>/<li>', () => {
    const bubble = renderAi('Items:\n- one\n- two');
    const items = bubble.querySelectorAll('ul > li');
    expect(Array.from(items, (li) => li.textContent)).toEqual(['one', 'two']);
    expect(bubble.querySelector('p')?.textContent).toBe('Items:');
  });

  it('AC3: a fenced code block keeps its lines and gets no <br>', () => {
    const bubble = renderAi('```js\nconst a = 1;\nconst b = 2;\n```');
    const code = bubble.querySelector('pre > code') as HTMLElement;
    expect(code.textContent).toBe('const a = 1;\nconst b = 2;\n');
    expect(bubble.querySelector('pre br')).toBeNull();
  });

  it('AC4: AI bubble white-space stays normal (E1-01 AC4)', () => {
    const bubble = renderAi('line one\nline two');
    // max-width comes from .msg-bubble, proving theme.css applied to this bubble.
    expect(getComputedStyle(bubble).maxWidth).toBe('82%');
    expect(['', 'normal']).toContain(getComputedStyle(bubble).whiteSpace);
  });
});
