# E1-03 — Line breaks in AI (Markdown) messages

Source: GitHub nhatduong-agilityio/deep-agents#9; backlog `docs/BACKLOG.md` E1-03 (follow-up to E1-01's open question) · Branch: `worktree-e1-03` · Status: In progress (BA chose option a, 2026-10-22)

## Context

E1-01 fixed line breaks in human bubbles and left AI messages out of scope. AI messages go through Markdown: `apps/web/src/App.tsx:217` renders `<Markdown>{content}</Markdown>` with `react-markdown` 10.1.0 and no remark plugins. In CommonMark a single `\n` inside a paragraph is a _soft break_. It stays as a `\n` text node, and the AI bubble's `white-space: normal` (E1-01 AC4) shows it as a space.

Module: Web chat UI (`apps/web/src`), see `docs/PROJECT_BRIEF.md`.

### Findings (2026-10-22)

Each input was rendered with `renderToStaticMarkup(<Markdown>{input}</Markdown>)` using the installed `react-markdown` 10.1.0, the same call as `App.tsx:217`. CSS was read from `apps/web/src/theme.css:391-446`.

| Input                                   | Rendered HTML                                                              | What the user sees                                                                 | Broken?                                   |
| --------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| Single `\n`: `"line one\nline two"`     | `<p>line one\nline two</p>`                                                | `line one line two` on one row (`white-space: normal` turns the `\n` into a space) | **Yes**, if the author meant a line break |
| Double `\n\n`: `"para one\n\npara two"` | `<p>para one</p>\n<p>para two</p>`                                         | Two paragraphs, `0.6em` apart                                                      | No                                        |
| List: `"Items:\n- one\n- two"`          | `<p>Items:</p>\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>`                   | A paragraph and a two-item bulleted list                                           | No                                        |
| Code block (fenced, 2 lines)            | `<pre><code class="language-js">const a = 1;\nconst b = 2;\n</code></pre>` | Two code lines (`pre` keeps the browser's default `white-space: pre`)              | No                                        |

Runs of blank lines (`\n\n\n\n`) collapse to a single paragraph gap, as CommonMark requires. TODO: this was not rendered separately; it is out of scope (see below).

Not checked: a real model reply in the browser. The table above is a static render, not a screenshot.

## User story

As a chat user, I want an AI reply that puts text on separate lines to show those lines, so that addresses, short poems and step lists without Markdown syntax stay readable.

## Acceptance criteria

Option (a), confirmed by the user acting as BA, 2026-10-22:

- [ ] **AC1** — Given an AI message `"line one\nline two"`, when it is rendered, then the bubble has a `<br>` between the two lines and both lines are in one `<p>`
- [ ] **AC2** — Given `"para one\n\npara two"`, when it is rendered, then it has two `<p>` elements and no `<br>`
- [ ] **AC3** — Given a list or a fenced code block, when it is rendered, then it still renders as `<ul>/<li>` or `<pre><code>`, with the code lines unchanged (no `<br>` inside `<pre>`)
- [ ] **AC4** — The AI bubble's computed `white-space` stays `normal` (E1-01 AC4 unchanged)

## Out of scope

- Runs of blank lines in AI messages (CommonMark collapses them; not raised by users).
- Human messages (done in E1-01), tables, other Markdown styling.

## Affected areas

- `apps/web/src/App.tsx:217` — the AI Markdown render (option a only)
- `apps/web/package.json`, `pnpm-lock.yaml` — new dependency `remark-breaks` (option a only)
- `apps/web/src/__tests__/AiMarkdownLineBreaks.test.tsx` — new test file

## Open questions

| Question                                                               | Blocking? | Proposed answer / assumption in use                                                                                                                                                                                                                                                                                                           | BA's answer                                                                          |
| ---------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. Should a single `\n` in an AI message show as a visible line break? | Yes       | (a) Yes: add `remark-breaks` (latest `4.0.0` per `npm show remark-breaks version`, 2026-10-22, pinned exactly), which turns soft breaks into `<br>`; `\n\n`, lists and code blocks are unchanged. (b) No: keep CommonMark behaviour and document it. Claude's proposal: (a), because model replies often use single line breaks for structure | (a) Yes, add `remark-breaks` `4.0.0`. Confirmed by the user acting as BA, 2026-10-22 |

## Plan

1. Investigation (done 2026-10-22): the findings table above.
2. Option (a): red `test:` commit with `AiMarkdownLineBreaks.test.tsx`, then `fix:` adding `remarkPlugins={[remarkBreaks]}`.

## Test plan

| AC      | Test type                        | Test file                                              |
| ------- | -------------------------------- | ------------------------------------------------------ |
| AC1–AC4 | unit (jsdom, `useStream` mocked) | `apps/web/src/__tests__/AiMarkdownLineBreaks.test.tsx` |

## Completion evidence

TODO
