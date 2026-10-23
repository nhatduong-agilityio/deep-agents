Watch this repo's open pull requests and their CI. Each tick, stop early when there is nothing to do.

1. List my open PRs: `gh pr list --state open --author @me`.
2. For each PR run `gh pr checks <n>`. If a check is still pending, wait for the next tick.
3. If a check failed, read the failing log (`gh run view <run-id> --log-failed`), find the root cause and fix it on the PR's branch. Verify locally first: `pnpm typecheck`, `pnpm exec eslint apps/web/src`, `pnpm test`. Commit with a Conventional Commit message, and ask before pushing.
4. If review comments arrived (`gh pr view <n> --comments`), answer each one or fix it. A `claude-review` job that fails with HTTP 429 while installing Claude Code is not a code failure: re-run it with `gh run rerun <run-id> --failed`.
5. Never merge, never push to `main` or `deep-agents`, never read `.env` files, never print `AUTH_TOKEN`.
6. If every check is green and no comment is unanswered, say so in one line and stop the loop.
