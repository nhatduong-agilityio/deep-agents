# Backlog — deep-agents-phase

Ordered by what should be done first. Start an item with `/devkit:task <ID>`. Status: Todo · Doing · Review · Done.

Size: S is about half a day, M about 1 day, L about 2 days. Epics E1 and E2 come from tickets and documented gaps. E3 and E4 come from deferred or "v2" notes in `docs/tasks.md`. They need BA confirmation before anyone starts them (see the open questions in `docs/PROJECT_BRIEF.md`).

## Epic E1: Chat UI display bugs (GitLab #8, #9)

| ID    | Item                                                                                                                                                                           | Value                                                                                                               | Depends on | Size | Status         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------- | ---- | -------------- |
| E1-01 | Show line breaks in sent human messages (GitLab #8): add `white-space: pre-wrap` to `.msg-bubble--human`, keep long-line wrapping, add a component test on the rendered bubble | Multi-line messages from Shift+Enter (MR !155) are readable. Today `\n` shows as a space                            | —          | S    | In review (MR) |
| E1-02 | Auto-grow the message input up to the agreed maximum height, then scroll, and reset to one row after sending (GitLab #9). Add tests for growing and resetting                  | Earlier lines no longer scroll out of view while typing. Needs answers to the max-lines and resize-corner questions | —          | M    | Todo           |
| E1-03 | Check how multi-line AI (Markdown) messages render and how blank-line runs are handled; open a ticket if they are broken                                                       | Closes the open question in #8 without widening its scope                                                           | E1-01      | S    | Todo           |

## Epic E2: Evidence and documentation consistency

| ID    | Item                                                                                                                                                                                                      | Value                                                                                                    | Depends on              | Size | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------- | ---- | ------ |
| E2-01 | Reconcile T-FS-04 status: README says `[ ]`, while `docs/tasks.md` and `docs/PROGRESS.md` say `[x]`. Check against `reports/T-FS-04-report.md`                                                            | Reviewers see one consistent status before the 2026-10-16 deadline                                       | —                       | S    | Todo   |
| E2-02 | Add the deferred T-FS-02b Playwright e2e: send a report request, assert at least 1 todo reaches `completed` and at least 1 file appears in the files panel                                                | Closes the one unchecked T-FS-02b DoD bullet                                                             | —                       | M    | Todo   |
| E2-03 | Record the auth deviation: DDR-016 says per-user JWT, `auth.ts` uses a shared `AUTH_TOKEN`, and `docs/deploy.md` shows a `VITE_AUTH_TOKEN` option. Update DDR-016 and deploy.md to match the chosen model | Removes a security contradiction from the docs; a public `VITE_` token conflicts with the T-FS-00 policy | BA answer on auth model | S    | Todo   |

## Epic E3: Experiment follow-ups (post-deadline, needs confirmation)

| ID    | Item                                                                                                                | Value                                                                          | Depends on | Size | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------- | ---- | ------ |
| E3-01 | Re-run T-DA-05 judge calibration with unambiguous false controls                                                    | Makes critique precision figures non-provisional (calibration failed 2/3)      | —          | M    | Todo   |
| E3-02 | Run the T-DA-07 v2 fix as pre-registered in `results/trace-analysis/pre-registration-v2.json`                       | Tests whether the revision-gate fix reaches the 3/5 or better seeded-flaw gate | —          | L    | Todo   |
| E3-03 | Rebuild the T-DA-06 benchmark subset so the baseline fails 20% or more, with the gate pre-registered before running | Makes harness-step comparisons informative (currently 100% pass, at ceiling)   | —          | L    | Todo   |

## Epic E4: Fullstack v2 / production hardening (needs confirmation)

| ID    | Item                                                                                                                                                                                 | Value                                                                                   | Depends on                        | Size | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------- | ---- | ------ |
| E4-01 | Enable the research sub-agent in the served agent, with permissions inherited through `createDeepAgent({ permissions })`, and update the dump-tools and smoke-permissions assertions | Brings CIP/SVW into the served app without a permission bypass (the v2 note in T-FS-01) | E2-03                             | L    | Todo   |
| E4-02 | Count sub-agent token usage in `ThreadBudgetMiddleware`                                                                                                                              | The budget stays the real per-thread limit once sub-agents exist                        | E4-01                             | M    | Todo   |
| E4-03 | Implement per-user short-lived JWT auth with thread scoping (DDR-016 Option A), if real users are planned                                                                            | Per-user isolation; removes the shared-secret model                                     | E2-03, identity provider decision | L    | Todo   |
