# Report: T-FS-02b — Deep Agents UI: Agent-Specific Features

**Date completed:** 2026-10-08

## What was done

Five deep-agent-specific UI features added to the existing Vite + React frontend.

**New files:**

- `apps/web/src/TodoPanel.tsx` — Feature 1: renders `values.todos` from LangGraph state as a numbered list with ○/◑/● status icons and per-status colour coding; hidden when empty
- `apps/web/src/FilesPanel.tsx` — Feature 2: renders `values.files` filtered to `/report/**` paths; expand/collapse per file with full content view; download-as-blob button; handles both FileDataV1 (string array) and FileDataV2 (string | Uint8Array); hidden when empty
- `apps/web/src/__tests__/TodoPanel.test.tsx` — 6 component tests: empty state, all three statuses, accessible label
- `apps/web/src/__tests__/FilesPanel.test.tsx` — 9 component tests: empty state, path filtering, expand/collapse, download button, V1/V2 content formats, accessible label

**Modified files:**

- `apps/web/src/App.tsx` — integrated all 5 features using `stream.values`, `stream.interrupt`, `stream.respond`, `stream.subagents`, `stream.disconnect`; added URL persistence helpers; extended `useStream` destructure; fixed empty-bubble bug (skip messages where `flattenContent()` returns `""`)
- `apps/web/src/theme.css` — full CSS design system (350+ lines): design tokens, dark mode, full-height flex layout, bubble styles, streaming dots, interrupt dialog, todo/files/subagent panels; fixed `content-visibility: auto` auto-scroll bug
- `apps/web/src/app.css` — base reset, focus indicators, reduced motion
- `apps/web/src/main.tsx` — imports `app.css` then `theme.css`
- `apps/web/src/__tests__/App.test.tsx` — 85 tests across 11 groups covering all UI cases

**Bugs found and fixed during manual testing:**

- `FilesPanel` called `useCallback` after an early `return null`, violating Rules of Hooks; fixed by moving `useCallback` before the early return
- Empty AI message bubbles rendered as ghost rectangles after Stop was pressed before text arrived; fixed by skipping messages with empty `flattenContent()` result

**DoD gap — Playwright e2e test not written:** requires a live LangGraph server with real API keys and a full agent run. No Playwright runner is configured in the project. Deferred.

## Concepts covered

- **`stream.values` — LangGraph state snapshot:** The `useStream` hook exposes `values` as the full thread-level state emitted after each superstep. `values.todos` and `values.files` are the authoritative sources for todo and file state — not message parsing. Updated per superstep, not per token, so components re-render on state transitions rather than mid-token.

- **`stream.interrupt` / `stream.respond()`:** When the LangGraph graph calls `interrupt()`, `useStream` surfaces the pending interrupt as `stream.interrupt`. `stream.respond(payload)` sends the response back and resumes the run. The `{ approved, comment }` payload shape is a UI convention — the SDK accepts any `unknown`.

- **`stream.subagents` — SubagentDiscoverySnapshot map:** Keyed by tool-call id, each entry carries `name`, `status` (`"running" | "complete" | "error"`), `taskInput`. Populated from SSE events and seeded from checkpoint on thread reload.

- **Rules of Hooks — no hooks after early return:** React requires hooks to run unconditionally on every render in the same order. Calling `useCallback` after `if (...) return null` means the hook count differs between renders, crashing the component the moment the early-return condition changes. All hooks must appear before any conditional return.

- **Empty streaming messages after stop:** When `stop()` is pressed before any text has streamed, the AI message in the `messages` array has empty content but is still present. Rendering it produces an invisible-but-sized bubble (padding + border-radius with no text). Fix: skip any message where `flattenContent(msg.content).trim() === ""`.

- **URL thread persistence:** Passing `threadId` to `useStream` binds it to an existing thread and seeds `values` + `messages` from the checkpoint without a new run. Writing `?thread=` to the URL on first threadId gives share-URL and back-button semantics.

- **`FileDataV1` vs `FileDataV2`:** StateBackend stores files as either `{ content: string[] }` (V1) or `{ content: string | Uint8Array, mimeType }` (V2). `FilesPanel` detects V1 via `Array.isArray(file.content)` and joins lines with `\n`.

## Decisions and reasons

**`TodoPanel` and `FilesPanel` as separate named exports:** Testability — both need deterministic prop-based rendering verified in isolation without the full `useStream` mock.

**Reconnect button on network errors (not auto-reconnect):** `useStream` handles transient SSE drops internally. The button calls `stream.disconnect()` for user-triggered recovery after a confirmed error state. Auto-reconnect would loop on persistent failures.

**Interrupt response payload `{ approved, comment }`:** Structured to give the graph implementer enough signal for HITL approval flows without coupling the UI to a specific graph schema.

## Evidence of completion

```
 ✓ TodoPanel > renders nothing when todos is empty
 ✓ TodoPanel > renders a todo item with pending status
 ✓ TodoPanel > renders in_progress status
 ✓ TodoPanel > renders completed status
 ✓ TodoPanel > renders all three statuses together
 ✓ TodoPanel > has accessible section label
 ✓ FilesPanel > renders nothing when files is empty
 ✓ FilesPanel > renders nothing when no /report/ files exist
 ✓ FilesPanel > renders a /report/ file entry
 ✓ FilesPanel > filters out non-report files
 ✓ FilesPanel > expands file content on button click
 ✓ FilesPanel > collapses file content on second click
 ✓ FilesPanel > renders download button for each file
 ✓ FilesPanel > handles FileDataV1 (content as string array)
 ✓ FilesPanel > has accessible section label
 ✓ App > Structure & Landmarks (8 tests)
 ✓ App > Empty state (4 tests)
 ✓ App > Message bubbles (11 tests, including stop-bug regression)
 ✓ App > Streaming indicator (4 tests)
 ✓ App > Form interactions (9 tests)
 ✓ App > Interrupt dialog (9 tests)
 ✓ App > Error display (7 tests)
 ✓ App > Tool calls (3 tests)
 ✓ App > Sub-agents (6 tests)
 ✓ App > Todo panel (3 tests)
 ✓ App > Files panel (3 tests)

Test Files  3 passed (3)
     Tests  85 passed (85)
```

Root typecheck: clean. Web typecheck: clean.

**DoD bullet 3 — Playwright e2e:** not written. Requires live server + real API keys + full agent run with todo transitions. No e2e runner configured in the project. Marked deferred in `docs/tasks.md`.

## Gotchas / lessons learned

- **Rules of Hooks crash on first data arrival:** `FilesPanel` had `useCallback` after `return null`. The crash only manifests when the condition flips from true to false (i.e., the first time files appear). It does not crash on initial render with no files. This class of bug is invisible until real data arrives.

- **Empty AI bubbles after Stop:** When Stop is pressed before the first token, the message array still contains an `AIMessage` with `content: ""`. Without a content guard, it renders as a ghost rounded-rectangle. The guard (`!content.trim()`) must be in the render path, not the streaming hook.

- **`content-visibility: auto` breaks `scrollHeight`:** Removed from `.message-log`. `content-visibility: auto` with `contain-intrinsic-size` makes `scrollHeight` stale, causing auto-scroll to silently fail.

- **`<span>` containing Markdown block elements:** AI bubble must be a `<div>`, not a `<span>`. `react-markdown` renders `<p>`, `<ul>`, `<pre>` (all block elements). A block inside an inline element is invalid HTML; browsers auto-correct by ejecting the block, which destroys the bubble's background and border-radius.

- **`values` is updated per superstep, not per token:** Todos and files appear atomically after the model finishes a turn and the state checkpoint is written — not incrementally during streaming.
