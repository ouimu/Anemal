---
description: Lane B — fix a bug through the reproduce → root-cause → fix → regression path (skips the feature pipeline's design gates, escalates to Lane A when the fix outgrows it)
---

# /anemal-fix-bug — Lane B

Entry point for **something is broken and should not be**. Not for new behaviour (Lane A), not for a
live incident (`/anemal-hotfix`), not for restructuring (`/anemal-refactor`).

## What to do

1. Load the `anemal-dev-lanes` skill and read `.claude/skills/anemal-dev-lanes/references/bugfix.md`.
2. Capture the symptom: who hit it, which tenant/role/plane, how to reproduce.
3. Write a **failing test** that reproduces it (skill `tdd`), then name the **root cause** in one
   sentence (skill `diagnosing-bugs`).
   ⛔ **Gate — do not edit production code until both exist.** A guess is not a root cause.
4. `@dev-agent` makes the smallest change that turns the test green.
5. `@qa-agent` runs the full suite; the new test stays permanently. Cross-tenant bug → add the
   isolation test.
6. `@scribe-agent` ships it via `/anemal-finish-branch`.

## Escalate to Lane A (Step 3.4, `@arch-agent`) if the fix needs

a schema change · an API contract change · more than 3 files · or the root cause is a design flaw.

Stop and treat as Lane C if a query returns another tenant's data, PII appears in logs, or production
is actively broken.

$ARGUMENTS
