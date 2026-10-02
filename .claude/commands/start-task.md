---
description: Load a task from docs/tasks.md and begin it following project conventions
argument-hint: <task-id>
---

# /start-task

You are starting task **$ARGUMENTS**.

1. Read `docs/PROGRESS.md` (resume point) and `docs/decisions/README.md` (decisions
   already made — do not re-decide what is already settled).
2. Find task **$ARGUMENTS** in `docs/tasks.md`. If the task ID does not exist or is
   ambiguous, stop and ask. Otherwise restate:
   - Scope and what it touches
   - The Definition of Done in 3–5 bullets
3. Re-read `docs/CODING-STANDARDS.md` for patterns this task needs. Note explicitly
   which conventions apply.
4. Propose a plan: numbered list of files to add/change, tests to write, anything
   else needed. Then write **exactly this line and stop**:
   > Plan ready — reply "go" to begin.
   > Do not write any file, run any command, or produce any code until the user
   > replies "go".
5. On "go":
   - Mark the task `[~]` in `docs/tasks.md`.
   - Append to the Activity Log in `docs/PROGRESS.md`:
     `| YYYY-MM-DD | Started | <task ID> — <task title> | — |`
   - Update the Resume Point in `docs/PROGRESS.md`.
   - Implement only this task. Do not start adjacent tasks.
6. Before adding any new npm package, run `npm view <pkg> version` to confirm the
   latest version. Record the pinned version and rationale in `docs/PROGRESS.md`
   or a new DDR (`/ddr`).
7. When the DoD is fully met, remind the user:
   > DoD met — run `/finish-task $ARGUMENTS` to close this task.
