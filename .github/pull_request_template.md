## What

<!-- 1–3 sentences: what changed, for a reviewer who doesn't know the ticket. -->

Closes #
Spec / plan:

**Change** (files and the reason for each):

-

**Commits** (`git log --oneline main..HEAD`; for bug fixes, the failing `test:` commit comes before the `fix:`):

```text

```

## Why

<!-- The bug report (steps / expected / actual / environment) or the requirement, then the cause found. -->

## How tested

**Run it** (only if different from the README):

```bash

```

**Acceptance criteria**

| AC  | Status             | Evidence (test name, command + output, screenshot) |
| --- | ------------------ | -------------------------------------------------- |
| AC1 | ✅ / ⚠️ assumption |                                                    |

**Commands**

```bash
pnpm typecheck
pnpm lint && pnpm exec eslint apps/web/src
pnpm test
```

**See the test fail before the fix:** `git checkout <test commit> && pnpm --filter web exec vitest run <file>`

**Not tested:** <!-- browsers, devices, real API runs: write TODO, never leave blank -->

**Risks and impact:** <!-- other modules affected, rollback -->

## Screenshots

**Before:** TODO

**After:** TODO

## Checklist

- [ ] Typecheck, lint and tests pass
- [ ] Checked in the running app (UI changes)
- [ ] No secrets, tokens or `.env` values in the diff, logs or screenshots
- [ ] Open questions answered, or assumptions stated
- [ ] Out-of-scope findings filed as separate issues
