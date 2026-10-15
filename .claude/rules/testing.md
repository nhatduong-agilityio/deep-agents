---
paths:
  - '**/*.{test,spec}.{ts,tsx}'
  - 'apps/web/e2e/**/*'
---

# Testing

- Vitest with explicit imports (`import { describe, it, expect, vi } from 'vitest'`), `describe`/`it` style (no `test(`)
- Bug fixes go test-first: commit a failing `test:` that fails for the bug's reason, then the `fix:`; add a control test for the behaviour that must keep working
- Web component tests mock `useStream` via `vi.mock('@langchain/react')` and drive the UI with `@testing-library/user-event`
- Prefer one file over the full suite: `pnpm exec vitest run <file>` (root) or `pnpm --filter web exec vitest run <file>`
- If `dist/` exists (after `pnpm build`), root vitest also runs the compiled tests, including e2e — delete `dist/` first
- `pnpm test` must stay offline; anything calling OpenAI/Groq/LangSmith belongs in `experiments/__tests__/e2e` (`pnpm test:e2e`)
- Node tests use `tmpdir()` fixtures; never write into the repo
