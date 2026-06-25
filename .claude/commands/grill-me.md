---
description: MANDATORY Step 3.5 gate — stress-test a validated design before /write-plan (Anemal pipeline)
---

# /grill-me — Mandatory Design Grilling Gate

This is **Step 3.5** of the Anemal Standard Pipeline (see CLAUDE.md). It is
**MANDATORY and CANNOT be skipped**. It runs after `@ba-agent` sign-off and
BLOCKS `/write-plan` until it has run and every finding is resolved.

## What to do

1. Invoke the `grilling` skill now.
2. Relentlessly interview about the validated design from Step 3: assumptions,
   edge cases, failure modes, tenant-isolation/RBAC gaps, scope creep.
3. Continue until findings are exposed AND resolved.
4. Record unresolved findings — they block `/write-plan`. No grill = pipeline
   violation; restart from Step 3.5.

$ARGUMENTS
