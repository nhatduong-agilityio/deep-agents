# Web UI regression suite

Playwright tests for the chat UI, run in Chromium and Firefox against the Vite dev server only. The LangGraph API is
mocked with `page.route` (`mock-api.ts`), so the suite needs no backend and no API keys. It runs in CI on every PR
(`.github/workflows/ci.yml`, job `regression`).

```bash
pnpm --filter web test:regression   # starts Vite on :5174 with VITE_API_URL=http://localhost:2024
```

`e2e/` is different: it needs `pnpm dev:server` and a real model, and is not run in CI.

## What it covers

| Requirement                                                | Spec                      | Test                                                                        |
| ---------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------- |
| E1-02 AC1: the input grows with each line                  | `input-auto-grow.spec.ts` | `E1-02 AC1: the box grows with each line`                                   |
| E1-02 AC2: stops at 6 lines, then scrolls                  | `input-auto-grow.spec.ts` | `E1-02 AC2: it stops at 6 lines, then scrolls`                              |
| E1-02 AC3: back to one row when cleared (after a send)     | `input-auto-grow.spec.ts` | `E1-02 AC3: clearing the box resets it to one row`                          |
| E1-02 AC4: shrinks when lines are deleted                  | `input-auto-grow.spec.ts` | `E1-02 AC4: deleting lines shrinks the box`                                 |
| E1-02 AC5: no drag-resize corner                           | `input-auto-grow.spec.ts` | `E1-02 AC5: there is no drag-resize corner`                                 |
| #14: re-fits on width change, no ResizeObserver errors     | `input-auto-grow.spec.ts` | `#14: a long line re-fits when the window width changes, …`                 |
| #14: message log stays at the bottom while the input grows | `input-auto-grow.spec.ts` | `#14: the message log stays at the bottom while the input grows`            |
| E1-03 AC1: single line breaks in AI replies are visible    | `ai-line-breaks.spec.ts`  | `E1-03 AC1: a single line break shows as a line break inside one paragraph` |
| E1-03 AC2/AC3: paragraphs, lists, code blocks unchanged    | `ai-line-breaks.spec.ts`  | `E1-03 AC2/AC3: paragraphs, lists and code blocks render as before`         |
| E1-03 AC4: AI bubble keeps `white-space: normal`           | `ai-line-breaks.spec.ts`  | `E1-03 AC4: the AI bubble keeps white-space normal`                         |

Each test was checked against the code before its change:

- With `App.tsx` and `theme.css` from `0e3e68a` (before E1-02), all 7 input tests fail.
- With `1e89c68` (before #14), only the two #14 tests fail.
- With the `App.tsx` from `a4618da` (before E1-03), the E1-03 AC1 test fails.

Assertions compare heights instead of pixels, so they hold across machines and fonts.
