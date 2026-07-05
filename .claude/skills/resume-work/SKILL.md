---
name: resume-work
description: Figure out what to do next in Anemal without the user re-explaining. Reads plan checkboxes under docs/superpowers/plans/ and git status, then states the next unchecked task. Use when the user says "continue", "what's next", "resume", or opens a session mid-feature.
triggers:
  - "continue"
  - "what's next"
  - "what next"
  - "resume"
  - "pick up where we left off"
---

# resume-work

Replaces the manual "read CLAUDE.md, continue the interrupted workflow" ritual
that got hand-typed across many past sessions. Plans are already the state —
no new tracking file needed.

## Steps

1. `git status --short` and `git branch --show-current` — is there
   uncommitted work? A feature branch checked out?
2. Find the most recently modified file under `docs/superpowers/plans/`
   whose name matches the current branch (or, if ambiguous, ask which
   feature — don't guess across unrelated in-flight plans).
3. Grep that file for `- [ ]` (unchecked) vs `- [x]` (checked) task lines.
4. State plainly:
   - Which step of the CLAUDE.md pipeline the feature is at (brainstorm /
     grill-with-docs / write-plan / ponytail gate / execute-plan / qa / finish-branch).
   - The next unchecked task, verbatim from the plan.
   - Anything that looks stalled (uncommitted changes untouched for a
     while, a gate mentioned in the plan but no evidence it ran).
5. Do not re-run completed steps. Do not restart the pipeline from
   Step 1 unless the plan or git state shows the feature was actually
   abandoned (no commits, no plan file).

## When there's no plan file

If no plan matches, this is a new request, not a resume — fall back to
normal `/brainstorm` intake instead of inventing a task.
