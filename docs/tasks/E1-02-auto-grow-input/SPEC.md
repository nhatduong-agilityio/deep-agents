# E1-02 — Auto-grow the message input

Source: GitHub nhatduong-agilityio/deep-agents#8 (origin: GitLab nhat.duong/generative-ai#9); backlog `docs/BACKLOG.md` E1-02 · Branch: `feat/e1-02-auto-grow-input` · Status: Done (PR TODO)

## Context

The chat input is `<textarea rows={1}>` (`apps/web/src/App.tsx:308-316`). Shift+Enter adds lines (MR !155), but the box stays one row high, so earlier lines scroll out of view while the user types. `.input-text` (`apps/web/src/theme.css:819`) sets only `min-height: 38px`: no `max-height`, no `resize`, so the browser's drag-resize corner is shown. `handleSubmit` (`App.tsx:114-122`) clears the value with `setInput('')`, but nothing resizes the box.

Module: Web chat UI (`apps/web/src`), see `docs/PROJECT_BRIEF.md`.

## User story

As a user of the policy-analyst chat, I want the message box to grow as I type more lines, up to a limit, so that I can see what I have written before I send it.

## Acceptance criteria

- [x] **AC1** — Given an empty input, when the user adds lines (Shift+Enter or wrapping), then the box grows by one line each time, from 1 row.
- [x] **AC2** — Given 6 lines of text, when more lines are added, then the box stays at the 6-line height and its content scrolls (`scrollHeight > clientHeight`). The limit is a CSS `max-height` on `.chat-form .input-text` (the chat form sets the input's font size and padding, so the cap lives with them).
- [x] **AC3** — Given a multi-line message, when it is sent, then the box goes back to 1 row.
- [x] **AC4** — Given a multi-line input, when lines are deleted, then the box shrinks to fit.
- [x] **AC5** — Given the input, when it is rendered, then it has no drag-resize corner (computed `resize: none`).
- [x] **AC6** — Given the input, Enter still sends and Shift+Enter still adds a line (control: true today).

## Out of scope

- AI (Markdown) message line breaks: E1-03.
- Changing what is sent (`handleSubmit` still trims).
- The interrupt-response textarea.

## Affected areas

- `apps/web/src/App.tsx` — ref on the message textarea and a layout effect that sets its height from `scrollHeight`
- `apps/web/src/theme.css` — `.input-text`: `resize: none`; `.chat-form .input-text`: `line-height: 1.5`, `max-height`, `overflow-y: auto`
- `apps/web/src/__tests__/ChatInputAutoGrow.test.tsx` — new test file (kept apart from `App.test.tsx` so E1-03 never edits the same test file)

## Open questions

| Question                                    | Blocking? | Proposed answer / assumption in use                                                   | BA's answer                                              |
| ------------------------------------------- | --------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| How many lines before the box scrolls?      | Yes       | 6 lines                                                                               | 6 lines — confirmed by the user as BA, 2026-10-22        |
| Keep the drag-resize corner?                | Yes       | No: `resize: none`; auto-grow makes it unnecessary                                    | Remove — confirmed by the user as BA, 2026-10-22         |
| What happens after a send?                  | Yes       | Reset to 1 row                                                                        | Reset to 1 row — confirmed by the user as BA, 2026-10-22 |
| Does the box shrink when lines are deleted? | No        | Yes                                                                                   | Yes — confirmed by the user as BA, 2026-10-22            |
| Where does the limit live?                  | No        | CSS `max-height` = 6 × line height + vertical padding + border; JS only sets `height` | CSS owns it — confirmed by the user as BA, 2026-10-22    |

## Plan

Session plan: Day 13 session A (approved 2026-10-22). Base `0e3e68a`.

1. `test(web): add failing tests for input auto-grow` — new `ChatInputAutoGrow.test.tsx`. jsdom has no layout, so `scrollHeight` is stubbed from the line count. Verified red by `pnpm --filter web exec vitest run src/__tests__/ChatInputAutoGrow.test.tsx`.
2. `fix(web): auto-grow the message input up to 6 lines` — `App.tsx` ref + `useLayoutEffect` on `input` (`height = auto`, then `scrollHeight` + border); `theme.css` rules. Verified green, plus `pnpm typecheck && pnpm test`.
3. Browser check (Playwright MCP on the Vite dev server, no backend): heights at 1, 3, 6, 8 lines and after clearing. It found the cap too low (5 lines); fixed in `fix(web): size the input cap from the chat form's font and padding`.
4. Code review (`devkit:code-reviewer`): 0 critical, 2 important, 5 minor. Applied in `fix(web): address E1-02 review findings`: the `scrollHeight` stub never goes below the current height (like a browser), so removing the `height = auto` reset now fails AC3/AC4 (mutation check); the message log stays at the bottom when the input grows; `line-height` moved off the shared `.input-text`, which the interrupt input also uses; the AC2 test checks the 6-line `calc`. Not applied (follow-ups): re-measure on width change (`ResizeObserver`); a token for the 1.5px border that the cap repeats as `3px`.

## Test plan

| AC  | Test type                                                                                                           | Test file                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| AC1 | unit (stubbed `scrollHeight` → inline `height`) + browser heights                                                   | `apps/web/src/__tests__/ChatInputAutoGrow.test.tsx`       |
| AC2 | unit (`.chat-form .input-text` `max-height` is `calc(6 * 1.5em + …)`, computed `overflow-y`) + browser 6 vs 8 lines | `apps/web/src/__tests__/ChatInputAutoGrow.test.tsx`       |
| AC3 | unit (Enter → `submit` called → 1-line height) + browser after clear                                                | `apps/web/src/__tests__/ChatInputAutoGrow.test.tsx`       |
| AC4 | unit (delete lines → smaller height)                                                                                | `apps/web/src/__tests__/ChatInputAutoGrow.test.tsx`       |
| AC5 | unit (`.input-text` rule in `theme.css`; jsdom's computed `resize` is always `none`) + browser computed `resize`    | `apps/web/src/__tests__/ChatInputAutoGrow.test.tsx`       |
| AC6 | unit (control, existing "Multi-line input" tests; AC1/AC3 also use Shift+Enter and Enter)                           | `apps/web/src/__tests__/App.test.tsx:443-478` (unchanged) |

jsdom does no layout: real heights and scrolling are browser-only.

## Completion evidence

| AC  | Evidence (command + result, screenshot, link)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 | Unit failed at `28fdef3` (`expected '' to be '37px'`), passes now. Chrome (Playwright): `offsetHeight` 51 / 99 / 171 px at 1 / 3 / 6 lines (line height 24px)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC2 | Unit failed at `28fdef3`, passes now. Chrome: 7, 8 and 9 lines stay at 171px with `scrollHeight` 192 / 216 > `clientHeight` 168; computed `max-height: 171px`, `overflow-y: auto`. Screenshot `e1-02-8-lines-scrolls.png`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AC3 | Unit (Enter → `submit` called → 1-line height) failed at `28fdef3`, passes now. Chrome: after clearing the value, back to 51px (a real send needs the server)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC4 | Unit failed at `28fdef3`, passes now; it fails again if the `height = auto` reset is removed (mutation check). Chrome: 8 → 3 lines gives 99px                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC5 | Unit (`.input-text` rule) failed at `28fdef3` (`expected '' to be 'none'`), passes now. Chrome computed `resize: none`; no corner in the screenshots                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AC6 | Control: `App.test.tsx` "Multi-line input" tests pass, unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Log | Chrome, log filled to scroll and pinned at the bottom: the gap from the bottom stays 0 at 3, 6, 8, 9 and 1 lines; a log scrolled up to 200 stays at 200. Not measured before the fix. Two height changes within the log's ~300ms smooth scroll lost the pin (gap 24px Chromium, 48px Firefox); fixed in #14, gap now 0 in both (see the #14 row). Remaining gap: if the input grows while a _new message_ is still smooth-scrolling the log, the pin can still be missed (the new-message scroll stays smooth by design)                                                                                                                                                                                                  |
| All | `pnpm typecheck` ✅ · `pnpm exec eslint apps/web/src` ✅ · `pnpm test` root 115/115, web 99/99 ✅. Screenshots: `claude-training/plans/20261022-day-13-build-parallel/evidence/e1-02-*.png`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| #14 | Follow-ups (2026-10-22): a `ResizeObserver` re-fits the input when its width changes, in the next animation frame (fitting inside the callback logged "ResizeObserver loop completed"); the cap uses `--input-border-width`; the log pin uses a `.message-log--instant` class (`scroll-behavior: auto`) while it sets `scrollTop`, not `scrollTo({ behavior: 'instant' })`, which throws where `'instant'` is unsupported. Pin check (log pinned, two lines added within ~80ms): gap 0 in Chromium and Firefox, 0 console errors. Chromium: a 40-word line is 98px at 1280px, 146px at 500px, 98px again at 1280px (before #14: stayed 98px and scrolled at 500px). Unit tests in `ChatInputAutoGrow.test.tsx`, red first |
| #15 | Browsers (2026-10-22, Playwright): Chromium and Firefox at 1280px and 375px give the same heights: 50 / 98 / 170 px at 1 / 3 / 6 lines, 171px and scrolling at 8, 98px after deleting to 3, 50px when cleared, computed `resize: none`. Before E1-02 (`0e3e68a`, Chromium): 44px at every line count, scrolling from line 2, `resize: both`. WebKit: not run, Playwright WebKit 27.2 crashes on launch on macOS 26.0.1 (segfault, also on a blank page). Screenshots: `evidence/followups/*-8-lines.png`                                                                                                                                                                                                                  |
