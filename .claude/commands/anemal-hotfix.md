---
description: Lane C — patch a live incident (prod down, data corrupting, security hole, or main red), ship it, and record the mandatory follow-up. Human-declared only.
---

# /anemal-hotfix — Lane C

**Only a human may start this lane.** An agent never declares a hotfix.

Qualifies only for ongoing harm: production down or 5xx on a live endpoint · data being corrupted ·
auth bypass, cross-tenant leak, or PII in logs · `main` red on the backend suite.
A UI glitch, a typo, or "slow but working" is Lane B — urgency is not the criterion, harm is.

## What to do

1. Load the `anemal-dev-lanes` skill and read `.claude/skills/anemal-dev-lanes/references/hotfix.md`.
2. Record the declaration: symptom · impact (who, how many tenants) · since when.
3. Write **one test** that pins the correct behaviour. Not a full TDD cycle.
4. Apply the **smallest** patch that stops the harm.
   ⛔ **Hard cap: no schema change, no new migration, no API contract change.** Needing one means
   this is not a hotfix — stop and escalate to Lane A/B.
5. Run the full backend suite plus the isolation/RBAC tests around the affected area. A cross-tenant
   incident's isolation test is **permanent**.
6. `@scribe-agent` ships it with the **HOTFIX block** in the PR body — symptom · impact · exemptions
   used · follow-up link. Missing a field blocks the merge.
7. ⛔ **Gate:** add the entry under "Open hotfix debt" in `.claude/roadmap/index.md` pointing at the
   Lane A or Lane B follow-up. No entry, no merge.
8. Write an ADR if this changed behaviour that an ADR or spec had already settled.

Skipping brainstorm / BA / grill / arch / ponytail is the recorded exemption of this lane.
At least one test, tenant isolation, and the follow-up entry are **never** skippable.

$ARGUMENTS
