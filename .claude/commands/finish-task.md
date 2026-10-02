---
description: Verify DoD, mark a task complete, write a task report, log it, and surface the next task
argument-hint: <task-id>
---

# /finish-task

You are closing task **$ARGUMENTS**.

1. Find task **$ARGUMENTS** in `docs/tasks.md`. Confirm it is currently `[~]`. If
   it is `[ ]` or `[x]`, stop and tell the user — do not modify anything.
2. Read the task's Definition of Done bullets. Check each one explicitly against
   real evidence (run the code, run the tests — don't infer from reading code).
   If any bullet is not met, list the gaps and stop. Do not mark the task done.
3. All DoD bullets met — write a task report to `reports/<task-id>-report.md`
   using the structure below. This file is mandatory — do not skip it.

   ```markdown
   # Report: <task-id> — <task title>

   **Date completed:** YYYY-MM-DD

   ## What was done

   Concise description of every action taken: files created, commands run,
   APIs called, configuration changed. Include file paths.

   ## Concepts covered

   For each concept exercised in this task:

   - **<Concept name>:** one or two sentences explaining what it is, why it exists,
     and the specific rule or behaviour that matters most.

   ## Decisions and reasons

   Any non-obvious choice made during the task — why one approach was picked over
   another. If a DDR was created, reference it here.

   ## Evidence of completion

   - Sample output or log snippet (paste real output, not invented)
   - LangSmith trace URL or trace ID if applicable
   - Any output file paths produced

   ## Gotchas / lessons learned

   Anything that was surprising, broke in an unexpected way, or that future tasks
   should watch out for.
   ```

4. Change `[~]` to `[x]` in `docs/tasks.md`, noting the report path if relevant.
5. Append to the Activity Log in `docs/PROGRESS.md`:
   `| YYYY-MM-DD | Completed | <task ID> — <task title> | reports/<task-id>-report.md |`
6. Find the next `[ ]` task in `docs/tasks.md` (top to bottom) and update the
   Resume Point in `docs/PROGRESS.md` to point at it. If none remain, note that
   explicitly instead.
7. If this task introduced a significant design decision, ask:
   > This task made a notable design choice. Should I create a DDR to record it?
   > If yes, invoke `/ddr` with the decision topic as the argument.
8. Confirm to the user:
   > [x] **$ARGUMENTS** closed. Report written to `reports/<task-id>-report.md`. Next: `<next task ID>` — <next task title>.
