# E1-01 — Show line breaks in sent human messages

Source: GitLab nhat.duong/generative-ai#8 ("Sent messages show line breaks on one row"); backlog `docs/BACKLOG.md` E1-01 · Branch: `fix/E1-01-human-message-line-breaks` · Status: Done (MR !157)

## Context

MR !155 (issue #1) lets users type multi-line messages with Shift+Enter, and the line break reaches the server: the request body has `"content":"line one\nline two"`. The chat bubble then shows the message on one row ("line one line two"). Human messages are rendered as plain text (`apps/web/src/App.tsx:217`), and neither `.msg-bubble` nor `.msg-bubble--human` (`apps/web/src/theme.css:338`, `:346`) sets `white-space`. The browser default (`normal`) collapses `\n` to a space.

Module: Web chat UI (`apps/web/src`), see `docs/PROJECT_BRIEF.md`.

## User story

As a user of the policy-analyst chat, I want my sent multi-line message to show each line on its own row, so that the conversation shows what I actually wrote.

## Acceptance criteria

- [x] **AC1** — Given a human message `line one\nline two` (freshly sent, or loaded when a thread is resumed — same render path), when it appears in the message history, then the bubble shows `line one` and `line two` on two visual lines (browser: `innerText === 'line one\nline two'`; the human bubble's computed `white-space` is `pre-wrap`).
- [x] **AC2** — Given a human message containing a 300-character string with no spaces (e.g. a URL), when it is rendered at 1280px and 375px viewport widths, then it wraps inside the bubble: bubble `scrollWidth <= clientWidth` and message-log `scrollWidth <= clientWidth`.
- [x] **AC3** — Given a human message whose content contains `\n` and Markdown/HTML-like text, when it is rendered, then the bubble's `textContent` equals the content exactly and no `strong`, `b`, `h1` or `ul` element is created (control: already true today).
- [x] **AC4** — Given an AI message, when it is rendered, then it still goes through Markdown and the AI bubble's computed `white-space` stays `normal` (the rule is on `.msg-bubble--human` only; Markdown's `\n` text nodes would otherwise add blank lines — E1-03).

## Out of scope

- AI (Markdown) message line breaks and runs of blank lines: backlog E1-03.
- Growing the input box: GitLab #9 / E1-02.
- Changing what is sent (`handleSubmit` trims leading and trailing whitespace; that stays).

## Affected areas

- `apps/web/src/theme.css` — `.msg-bubble--human` rule (`:346`)
- `apps/web/src/__tests__/App.test.tsx` — rendered-content test for human bubbles
- `apps/web/vite.config.ts` — `test.css.include` for `theme.css`, so jsdom computed-style tests can fail first (spike confirmed: jsdom reads `.files-content` `pre-wrap` and the bubble's `max-width: 82%`)
- `apps/web/src/App.tsx:217` — read only; no change expected

## Open questions

| Question                                                                                                                                                                                                                                                     | Blocking? | Proposed answer / assumption in use                                                                                                | BA's answer                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **B1** Long unbroken strings (URLs) already overflow the bubble and give the chat a horizontal scrollbar (checked in Chrome at 1280px and 375px). `pre-wrap` alone does not fix it; adding `overflow-wrap: anywhere` to the same rule does. Fix it in E1-01? | **Yes**   | Yes: one extra line on the same rule, plus AC2. Not `word-break: break-all` (breaks Vietnamese/CJK words mid-word)                 | Include — confirmed by the user, 2026-10-15    |
| **B2** How to meet the test-first rule when CSS is invisible to jsdom by default?                                                                                                                                                                            | Resolved  | Spike passed: enable `test.css` for `theme.css`; the failing test asserts computed `white-space` (and `overflow-wrap` if B1 = yes) | —                                              |
| Are AI (Markdown) messages affected?                                                                                                                                                                                                                         | No        | Out of scope, tracked as E1-03                                                                                                     | Confirmed by the user acting as BA, 2026-10-15 |
| Should several blank lines in a row be kept or collapsed?                                                                                                                                                                                                    | No        | Keep them as typed (`pre-wrap` keeps them; `pre-line` rejected because AC3 says "exactly")                                         | Confirmed by the user acting as BA, 2026-10-15 |
| Messages from other clients may have leading/trailing whitespace (only the UI trims)                                                                                                                                                                         | No        | Render content as stored; no trim at render time                                                                                   | Confirmed by the user acting as BA, 2026-10-15 |
| Tabs render 8 characters wide                                                                                                                                                                                                                                | No        | Keep the default; no `tab-size`                                                                                                    |                                                |
| RTL text (`dir="auto"`)                                                                                                                                                                                                                                      | No        | Out of scope; follow-up if needed                                                                                                  |                                                |
| `theme.css` is not Prettier-formatted; the Edit hook would reformat the whole file                                                                                                                                                                           | No        | Edit with the hook inactive or revert unrelated formatting; keep the diff to the changed rule                                      |                                                |

## Plan

Branch `fix/E1-01-human-message-line-breaks` from `deep-agents`. Three commits (test first), then browser evidence:

1. `test(web): load theme.css in jsdom tests` — `apps/web/vite.config.ts`: add `test.css: { include: [/theme\.css$/] }`. No test changes, so the suite must stay 90/90 — verified by `pnpm --filter web exec vitest run`.
2. `test(web): add failing tests for line breaks in human bubbles` — new `describe('Human bubble line breaks (#8)')` in `App.test.tsx` after "Message bubbles", importing `../theme.css`, rendering via `mockReturn({ messages: [...] })` like the existing bubble tests:
   - AC1: human bubble computed `white-space` is `pre-wrap` → **fails** today (`""`)
   - AC2: human bubble computed `overflow-wrap` is `anywhere` → **fails** today (`normal`)
   - AC3 (control): `textContent` equals `'**bold**\n<b>x</b>\n# h\n- item'` exactly, no `strong,b,h1,ul` inside → passes today
   - AC4 (control): AI bubble computed `white-space` is not `pre-wrap` → passes today
   - Verified by running the file: exactly AC1 and AC2 fail, for the expected values.
3. `fix(web): keep line breaks and wrap long words in human bubbles` — `theme.css` `.msg-bubble--human` (`:346`): add `white-space: pre-wrap;` and `overflow-wrap: anywhere;`. Diff limited to those 2 lines (no whole-file reformat). Verified by the test file (all pass), `pnpm test`, `pnpm typecheck`, `pnpm exec eslint apps/web/src`.
4. Browser evidence (no commit): `ui-verifier` / Playwright on the running app — AC1 `innerText === 'line one\nline two'` after a real Shift+Enter send; AC2 bubble and message-log `scrollWidth <= clientWidth` at 1280px and 375px.

Risks: `test.css` could change other web tests (mitigated: step 1 runs the suite before any test is added); a whole-file Prettier reformat of `theme.css` (mitigated: check `git diff --stat` shows +2 lines).

## Test plan

| AC  | Test type                                                                                            | Test file                                            |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| AC1 | unit (jsdom computed style — **the failing test**) + browser `innerText`                             | `apps/web/src/__tests__/App.test.tsx`; `ui-verifier` |
| AC2 | unit (jsdom computed `overflow-wrap`, failing first) + browser `scrollWidth` at 1280/375px           | `apps/web/src/__tests__/App.test.tsx`; `ui-verifier` |
| AC3 | unit (RTL), control: `textContent` + no Markdown elements; not `getByText` (it collapses whitespace) | `apps/web/src/__tests__/App.test.tsx`                |
| AC4 | unit (jsdom computed style on the AI bubble) + existing Markdown tests                               | `apps/web/src/__tests__/App.test.tsx`                |

jsdom does no layout: line count and `scrollWidth` are browser-only.

## Completion evidence

| AC  | Evidence (command + result, screenshot, link)                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 | Unit: `AC1: human bubble keeps line breaks` failed at `d8620e7` (`expected '' to be 'pre-wrap'`), passes at `a04c57c`. Chrome (running app, real Shift+Enter send): `innerText "line one\nline two"`, `white-space: pre-wrap`, 2 rendered lines (46px / line-height 23.1px). Agent replied "I see two lines". Screenshots at 1280px and 375px |
| AC2 | Unit: `AC2: … overflow-wrap: anywhere` failed at `d8620e7` (`expected 'normal' to be 'anywhere'`), passes at `a04c57c`. Chrome, 320-char URL: 1280px bubble 605/605, log 778/778; 375px bubble 307/307, log 373/373 (scrollWidth/clientWidth, no overflow). Before the fix, both overflowed at both widths                                    |
| AC3 | Unit (control): `textContent` equals `'**bold**\n<b>x</b>\n# h\n- item'`, no `strong, b, h1, ul` — passes before and after                                                                                                                                                                                                                    |
| AC4 | Unit (control, tightened in `2298793` after review): AI bubble still renders `<strong>`, `max-width` 82% (stylesheet applied), `white-space` `''`/`normal`. Mutation check: adding `white-space: pre-line` to `.msg-bubble` makes it fail                                                                                                     |
| All | `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm exec eslint apps/web/src` ✅ · `pnpm test` root 115/115, web 94/94 ✅ · `theme.css` diff +2 lines                                                                                                                                                                                                |

Decided: B1 = include the URL-overflow fix (confirmed 2026-10-15). Confirmed by the user acting as BA (2026-10-15): blank lines and whitespace (including from other clients) shown as stored; AI Markdown line breaks out of scope (E1-03). Still an assumption: RTL out of scope. Code review: 0 critical; warnings 1 (browser evidence) and 2 (weak AC4) resolved; optional findings not applied.
