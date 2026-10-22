# E1-02 — Auto-grow the message input

Source: GitHub nhatduong-agilityio/deep-agents#8 (origin: GitLab nhat.duong/generative-ai#9); backlog `docs/BACKLOG.md` E1-02 · Branch: `feat/e1-02-auto-grow-input` · Status: In progress

## Context

The chat input is `<textarea rows={1}>` (`apps/web/src/App.tsx:308-316`). Shift+Enter adds lines (MR !155), but the box stays one row high, so earlier lines scroll out of view while the user types. `.input-text` (`apps/web/src/theme.css:819`) sets only `min-height: 38px`: no `max-height`, no `resize`, so the browser's drag-resize corner is shown. `handleSubmit` (`App.tsx:114-122`) clears the value with `setInput('')`, but nothing resizes the box.

Module: Web chat UI (`apps/web/src`), see `docs/PROJECT_BRIEF.md`.

## User story

As a user of the policy-analyst chat, I want the message box to grow as I type more lines, up to a limit, so that I can see what I have written before I send it.

## Acceptance criteria

- [ ] **AC1** — Given an empty input, when the user adds lines (Shift+Enter or wrapping), then the box grows by one line each time, from 1 row.
- [ ] **AC2** — Given 6 lines of text, when more lines are added, then the box stays at the 6-line height and its content scrolls (`scrollHeight > clientHeight`). The limit is a CSS `max-height` on `.input-text`.
- [ ] **AC3** — Given a multi-line message, when it is sent, then the box goes back to 1 row.
- [ ] **AC4** — Given a multi-line input, when lines are deleted, then the box shrinks to fit.
- [ ] **AC5** — Given the input, when it is rendered, then it has no drag-resize corner (computed `resize: none`).
- [ ] **AC6** — Given the input, Enter still sends and Shift+Enter still adds a line (control: true today).

## Out of scope

- AI (Markdown) message line breaks: E1-03.
- Changing what is sent (`handleSubmit` still trims).
- The interrupt-response textarea.

## Affected areas

- `apps/web/src/App.tsx` — ref on the message textarea and a layout effect that sets its height from `scrollHeight`
- `apps/web/src/theme.css` — `.input-text`: `line-height`, `resize: none`, `overflow-y: auto`, `max-height`
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
2. `fix(web): auto-grow the message input up to 6 lines` — `App.tsx` ref + `useLayoutEffect` on `input` (`height = auto`, then `scrollHeight` + border); `theme.css` `.input-text` rules. Verified green, plus `pnpm typecheck && pnpm test`.
3. Browser check (Playwright, Vite dev server, no backend): heights at 1, 3, 6, 8 lines and after clearing.

## Test plan

| AC  | Test type                                                                                                        | Test file                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| AC1 | unit (stubbed `scrollHeight` → inline `height`) + browser heights                                                | `apps/web/src/__tests__/ChatInputAutoGrow.test.tsx`       |
| AC2 | unit (computed `max-height`, `overflow-y`) + browser 6 vs 8 lines                                                | `apps/web/src/__tests__/ChatInputAutoGrow.test.tsx`       |
| AC3 | unit (Enter → `submit` called → 1-line height) + browser after clear                                             | `apps/web/src/__tests__/ChatInputAutoGrow.test.tsx`       |
| AC4 | unit (delete lines → smaller height)                                                                             | `apps/web/src/__tests__/ChatInputAutoGrow.test.tsx`       |
| AC5 | unit (`.input-text` rule in `theme.css`; jsdom's computed `resize` is always `none`) + browser computed `resize` | `apps/web/src/__tests__/ChatInputAutoGrow.test.tsx`       |
| AC6 | unit (control, existing "Multi-line input" tests; AC1/AC3 also use Shift+Enter and Enter)                        | `apps/web/src/__tests__/App.test.tsx:443-478` (unchanged) |

jsdom does no layout: real heights and scrolling are browser-only.

## Completion evidence

| AC  | Evidence (command + result, screenshot, link) |
| --- | --------------------------------------------- |
| All | TODO                                          |
