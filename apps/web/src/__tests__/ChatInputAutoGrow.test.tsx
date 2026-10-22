import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import '../theme.css';

// E1-02 (GitHub #8): the message input grows with its content up to 6 lines, then scrolls.
// Its own file so E1-03 never edits the same test file.

// ─── mock factory (same shape as App.test.tsx) ────────────────────────────────

type UseStreamReturn = ReturnType<typeof useStream>;

function makeDefaultStream() {
  return {
    messages: [] as unknown[],
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

// ─── layout stub ──────────────────────────────────────────────────────────────

// jsdom does no layout, so scrollHeight is always 0. Stub it as a 21px line height
// plus 16px vertical padding per the value's line count, like a real textarea.
const LINE = 21;
const PADDING_Y = 16;
const scrollHeightFor = (lines: number) => lines * LINE + PADDING_Y;

beforeEach(() => {
  mockUseStream.mockReturnValue(mockReturn());
  vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
    this: HTMLTextAreaElement,
  ) {
    return scrollHeightFor(this.value.split('\n').length);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function getInput() {
  return screen.getByRole('textbox', { name: /message input/i }) as HTMLTextAreaElement;
}

// border-box: the inline height must include the top and bottom border.
function expectedHeight(input: HTMLTextAreaElement, lines: number) {
  const style = getComputedStyle(input);
  const borderY = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  return `${scrollHeightFor(lines) + borderY}px`;
}

describe('Message input auto-grow (E1-02)', () => {
  it('AC1: the box grows with each added line', async () => {
    const user = userEvent.setup();
    render(<App />);
    const input = getInput();
    await user.type(input, 'line one');
    expect(input.style.height).toBe(expectedHeight(input, 1));

    await user.keyboard('{Shift>}{Enter}{/Shift}line two{Shift>}{Enter}{/Shift}line three');
    expect(input.value).toBe('line one\nline two\nline three');
    expect(input.style.height).toBe(expectedHeight(input, 3));
  });

  it('AC2: CSS caps the height and the content scrolls past it', () => {
    render(<App />);
    const style = getComputedStyle(getInput());
    expect(['', 'none']).not.toContain(style.maxHeight);
    expect(style.overflowY).toBe('auto');
  });

  it('AC3: the box resets to 1 row after a send', async () => {
    const user = userEvent.setup();
    const submitMock = vi.fn();
    mockUseStream.mockReturnValue(mockReturn({ submit: submitMock }));
    render(<App />);
    const input = getInput();
    await user.type(input, 'line one');
    await user.keyboard('{Shift>}{Enter}{/Shift}line two');
    expect(input.style.height).toBe(expectedHeight(input, 2));

    await user.keyboard('{Enter}');
    expect(submitMock).toHaveBeenCalledOnce();
    expect(input.value).toBe('');
    expect(input.style.height).toBe(expectedHeight(input, 1));
  });

  it('AC4: the box shrinks when lines are deleted', () => {
    render(<App />);
    const input = getInput();
    fireEvent.change(input, { target: { value: 'a\nb\nc\nd' } });
    expect(input.style.height).toBe(expectedHeight(input, 4));

    fireEvent.change(input, { target: { value: 'a\nb' } });
    expect(input.style.height).toBe(expectedHeight(input, 2));
  });

  // jsdom has no browser default stylesheet, so computed `resize` is always 'none' there
  // (browsers default textareas to 'both'). Read the .input-text rule itself instead.
  it('AC5: there is no drag-resize corner', () => {
    const rules = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules));
    const inputRule = rules.find(
      (rule): rule is CSSStyleRule =>
        rule instanceof CSSStyleRule && rule.selectorText === '.input-text',
    );
    expect(inputRule, '.input-text rule must be loaded from theme.css').toBeDefined();
    expect(inputRule?.style.resize).toBe('none');
  });
});
