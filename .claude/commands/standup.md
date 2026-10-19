---
description: Draft my standup (Yesterday / Today / Blockers) from real git, PR and progress data — read-only
argument-hint: '[since] — default "yesterday"; e.g. "3 days ago", "2026-10-16"'
---

# /standup

Draft a standup for the current git user, covering work since **$ARGUMENTS** (use `yesterday` if empty;
on a Monday, `yesterday` means since last Friday).

This command is read-only. Don't edit, commit, push, comment or change any state. Report only what a command returned.

1. Who and where: `git config user.email`, `git branch --show-current`.
2. Commits: `git log --all --since="<since>" --author="<email>" --no-merges --format='%h %ad %s' --date=short`.
   Group them by branch if more than one branch has commits (`git branch -a --contains <sha>`).
3. Open PRs/MRs: `gh pr list --author @me --state open --json number,title,url,reviewDecision,isDraft,statusCheckRollup`
   for the GitHub remote. If `gh` fails, say so; don't guess. GitLab MRs: only if the GitLab MCP is connected,
   otherwise write "GitLab MRs: not checked (MCP not connected)".
4. Planned next: the **Next action** line in `docs/PROGRESS.md`, plus any plan in `plans/` with `Status: in-progress`
   (its first unticked phase).
5. Blockers: failing checks or "changes requested" from step 3, and `TODO`s in the in-progress plan or SPEC that need
   someone else's answer. If there are none, say "None found". Don't invent any.

Output only this, short enough to read aloud in under a minute:

```markdown
**Yesterday** — <bullets: what was done, each with a commit SHA or PR number>
**Today** — <bullets: next planned items, each with its source (PROGRESS.md / plan phase)>
**Blockers** — <bullets with the evidence, or "None found">
```
