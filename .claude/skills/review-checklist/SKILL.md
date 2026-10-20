---
name: review-checklist
description: Team code-review checklist for deep-agents — correctness, tests, readability, security basics, scope, in that order, with every suspicion tested before it is written down. Use when reviewing a branch, PR, MR, diff or commit, when asked to "review", "check my branch/PR/diff", or before approving or merging a change.
---

# Review checklist (deep-agents)

Review the diff, not the whole repo. Read-only: never edit, commit or push while reviewing.

## 1. Read the diff

- Base is `main` unless the user names another: `git diff --stat main...HEAD`, then `git diff main...HEAD`.
- Read the commit messages too (`git log --oneline main..HEAD`). A `refactor`/`style`/`chore` commit that changes
  behavior is itself a finding.
- Read `CLAUDE.md` and the `.claude/rules/` files that match the changed paths.

## 2. Walk the checklist in this order

| #   | Area            | Ask                                                                                                                                                                   |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Correctness     | Does it do what the commit/PR says? Edge cases: empty, whitespace, boundaries, errors, async (missing `await`, unhandled rejection), effect deps, inverted conditions |
| 2   | Tests           | Does a test fail without the change? Is new behavior covered? Did a test get weaker (`baseDelayMs: 1`, removed assertion)?                                            |
| 3   | Readability     | Names, dead code, comments that no longer match the code, patterns that differ from the surrounding code                                                              |
| 4   | Security basics | Secrets in the diff, auth/permission changes (`apps/api/src/auth.ts`, `PERMISSIONS` in `apps/api/src/agent.ts`), unsafe input to shell/HTML/paths, `.env*` access     |
| 5   | Scope           | Only files the change needs, no new dependencies without a reason, no unrelated clean-ups                                                                             |

## 3. Test each suspicion before writing it down

- Prove it with a command: a probe script in the system temp dir, a throwaway test file, or a `node -e` one-liner.
  Delete the probe afterwards; never commit it.
- If it can't be proved here, keep it but label it "unverified" with what would prove it.

## 4. Report

One table, most severe first:

| # | Area | Location (`path:line`) | Problem | Suggestion | Evidence (probe output, or "unverified") |

End with one line: **approve**, **approve with nits**, or **request changes**, and which rows block the merge.
Write "Nothing found" for an area with no findings rather than leaving it out.
