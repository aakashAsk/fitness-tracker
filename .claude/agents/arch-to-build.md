---
description: Audit the repo for designed-but-unimplemented features, then hand the backlog to the senior engineer
argument-hint: "[focus area, e.g. 'dashboard'] [auto]"
---

Run the architect-to-engineer pipeline for this repository. Arguments: $ARGUMENTS

Subagents cannot launch other subagents, so you (the main session) orchestrate both stages and keep the human gate between them.

## Stage 1: Audit
Invoke the `arch-gap-analyst` agent. If the arguments name a focus area (anything other than the word `auto`), tell it to limit the audit to that area. Wait for it to finish.

Then read `docs/architecture/gap-report.md` and `docs/architecture/backlog.md` and show the user:
- Counts of features by status (Implemented / Partial / UI-only / Stubbed / Not started)
- Firebase data findings, especially any NO-WRITER, EMPTY, RULES-BLOCKED, INDEX-MISSING, or UNVERIFIED items
- The ordered task list (ID, title, priority, size)
- Open questions the report says need a human decision

## Gate: approval
Stop and ask the user which tasks to proceed with: all, a specific range, or a re-prioritized order. Do not start implementation without an explicit yes. If open questions block any task, ask them first.

If the arguments contain `auto`, still show the summary above, but treat the user's approval of the plan as a single approval covering every unblocked task.

## Stage 2: Build
Invoke the `senior-software-engineer` agent with the approved task IDs. Run one task at a time (or the whole approved set if `auto`), and after each task:
- Read the updated `backlog.md` for status and evidence
- If a task is `blocked`, stop, explain why, and ask the user how to proceed

## Wrap-up
Summarize: tasks done, tasks blocked, deviations, remaining backlog, and what still needs a human (credentials, console checks, product decisions). Suggest running a code review on the changes before merging.