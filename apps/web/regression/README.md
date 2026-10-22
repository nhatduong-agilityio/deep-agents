# Web UI regression suite

Playwright tests for the chat UI, run in Chromium and Firefox against the Vite dev server only. The LangGraph API is
mocked with `page.route` (`mock-api.ts`), so the suite needs no backend and no API keys. It runs in CI on every PR
(`.github/workflows/ci.yml`, job `regression`).

```bash
pnpm --filter web test:regression   # starts Vite on :5174 with VITE_API_URL=http://localhost:2024
```

`e2e/` is different: it needs `pnpm dev:server` and a real model, and is not run in CI.

## What it covers

| Requirement                                               | Spec                      | Test                                                                                                                                   |
| --------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| E1-02 AC1: the input grows with each line                 | `input-auto-grow.spec.ts` | `E1-02 AC1: the box grows with each line`                                                                                              |
| E1-02 AC2: stops at 6 lines, then scrolls                 | `input-auto-grow.spec.ts` | `E1-02 AC2: it stops at 6 lines, then scrolls`                                                                                         |
| E1-02 AC2: pasting many lines stops at the cap            | `input-auto-grow.spec.ts` | `E1-02 AC2: pasting many lines stops at the cap and scrolls`                                                                           |
| E1-02 AC3: back to one row when cleared                   | `input-auto-grow.spec.ts` | `E1-02 AC3: clearing the box resets it to one row`                                                                                     |
| E1-02 AC4: shrinks when lines are deleted                 | `input-auto-grow.spec.ts` | `E1-02 AC4: deleting lines shrinks the box`                                                                                            |
| E1-02 AC5: no drag-resize corner                          | `input-auto-grow.spec.ts` | `E1-02 AC5: there is no drag-resize corner`                                                                                            |
| E1-02: fits at a 320px window, Send visible               | `input-auto-grow.spec.ts` | `E1-02: at a 320px window the box still fits its text and Send stays visible`                                                          |
| #14: re-fits on width change, no ResizeObserver errors    | `input-auto-grow.spec.ts` | `#14: a long line re-fits when the window width changes, …`                                                                            |
| #14: log stays at the bottom while the input grows        | `input-auto-grow.spec.ts` | `#14: the message log stays at the bottom while the input grows`                                                                       |
| #14: a log scrolled up a little doesn't move while typing | `input-auto-grow.spec.ts` | `#14: typing does not move a log the reader scrolled up a little` (only Firefox detects the bug; Chromium's scroll anchoring hides it) |
| #14: a log scrolled far up doesn't jump to the bottom     | `input-auto-grow.spec.ts` | `#14: a log scrolled far up keeps its place when the input grows`                                                                      |
| E1-03 AC1: single line breaks in AI replies are visible   | `ai-line-breaks.spec.ts`  | `E1-03 AC1: a single line break shows as a line break inside one paragraph`                                                            |
| E1-03 AC1: also for text-block content                    | `ai-line-breaks.spec.ts`  | `E1-03 AC1: a line break inside text-block content shows too`                                                                          |
| E1-03 AC2/AC3: paragraphs, lists, code blocks unchanged   | `ai-line-breaks.spec.ts`  | `E1-03 AC2/AC3: paragraphs, lists and code blocks render as before`                                                                    |
| E1-03 AC4: AI bubble keeps `white-space: normal`          | `ai-line-breaks.spec.ts`  | `E1-03 AC4: the AI bubble keeps white-space normal`                                                                                    |

The AI spec also fails if the app calls an API route the mock does not answer (`unhandledRequests`). ResizeObserver
errors are collected in the page (`window` `error` events): Playwright's `pageerror` never sees them.

Each test was checked against the code it guards (Day 14 and Day 15):

- With `App.tsx` and `theme.css` from `0e3e68a` (before E1-02), all 7 original input tests fail.
- With `1e89c68` (before #14), the two original #14 tests fail.
- With `4dcf4b7` (re-fit inside the ResizeObserver callback), the width test fails on the captured
  "ResizeObserver loop completed" errors in both browsers.
- With `1d2490e` (before the scroll restore), the "scrolled up a little" test fails in Firefox (30 → 72px).
- With the log always pinned to the bottom, the "scrolled far up" test fails in both browsers (moved 248px).
- With the `App.tsx` from `a4618da` (before E1-03), the E1-03 AC1 test fails.

Assertions compare heights instead of pixels, so they hold across machines and fonts.

Not covered here: the reset after an actual send (Enter → submit). That path needs a mocked streaming run; it is
covered by the unit test `AC3: the box resets to 1 row after a send` in `src/__tests__/ChatInputAutoGrow.test.tsx`.
