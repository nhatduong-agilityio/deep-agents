# Report: T-DA-00.2 — Skills Installation + Claude Code Hooks

**Date completed:** 2026-10-02

## What was done

Installed 6 workflow skills from `obra/superpowers` via `npx skills add` into
`.claude/skills/` and `.agents/skills/`. Configured two PostToolUse hooks in
`.claude/settings.local.json`. Added `.agents/`, `.claude/skills/`, and
`skills-lock.json` to `.gitignore` (machine-local tooling, not committed).
Added `.cspell.json` at repo root to suppress false-positive cSpell warnings
for project-specific terms (`langchain`, `deepagents`, `langgraph`, etc.).
Updated `CLAUDE.md` with the installed skills table and hook config for
persistent reference.

**Skills installed:**

| Skill                            | Source             |
| -------------------------------- | ------------------ |
| `verification-before-completion` | `obra/superpowers` |
| `systematic-debugging`           | `obra/superpowers` |
| `subagent-driven-development`    | `obra/superpowers` |
| `test-driven-development`        | `obra/superpowers` |
| `requesting-code-review`         | `obra/superpowers` |
| `finishing-a-development-branch` | `obra/superpowers` |

**Hooks configured in `.claude/settings.local.json`:**

- `Edit|Write` → `pnpm typecheck 2>&1 | head -20`
- `Bash` → `pnpm eslint <changed .ts files> 2>&1 | head -20`

## Concepts covered

- **Claude Code skills:** SKILL.md files in `.claude/skills/` that Claude Code
  loads as slash commands. They encode multi-step workflows (e.g., TDD cycle,
  root-cause analysis) so the agent follows a consistent process rather than
  improvising each time.

- **PostToolUse hooks:** Shell commands that fire automatically after specific
  tool calls. The key rule: hooks fire synchronously and their output is fed
  back to the agent — so a typecheck failure on `Edit` is caught before the
  next step, not after a full run.

- **Machine-local vs committed config:** `settings.local.json` is globally
  gitignored; skills and lock files were also gitignored after refactoring.
  Only `CLAUDE.md` (the human-readable reference) is committed — the actual
  installed files stay local.

## Decisions and reasons

**Dropped 3 of the original 9 skills** (`dispatching-parallel-agents`,
`using-git-worktrees`, `find-skills`): the first two conflict directly with
the hard constraint of sequential API runs; `find-skills` is meta-overhead
with no direct experiment mapping.

**Skills gitignored:** Skills are machine-local (installed by the developer
running the session), not project artifacts. Committing them would couple the
repo to a specific Claude Code version and make diffs noisy. `CLAUDE.md` documents
which skills to install and why — that's the durable record.

## Evidence of completion

```text
$ ls .claude/skills/
finishing-a-development-branch
requesting-code-review
subagent-driven-development
systematic-debugging
test-driven-development
verification-before-completion

PostToolUse hooks active:
  Edit|Write  → pnpm typecheck
  Bash        → pnpm eslint on changed .ts files
```

No LangSmith trace — this task produced only configuration.

## Gotchas / lessons learned

- **`npx cct@latest --health-check` is broken** — `cct@0.0.1-beta.1` has no
  binary. Removed from DoD; not worth blocking on a pre-release stub.
- **Skills gitignore order matters** — had to `git rm --cached` the staged
  skill files after adding them to `.gitignore`, since they were already in
  the index from an earlier (undone) commit.
- **Refactor before closing:** The original 9-skill list included two skills
  that directly conflict with project constraints. Caught during review —
  always check new tooling against `CLAUDE.md` hard constraints before
  treating a task as done.
