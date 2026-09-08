---
description: Lane D — restructure code without changing behaviour, under characterization tests, test-set equality, an unchanged contract, and a reverse-ponytail check that the codebase got smaller
---

# /anemal-refactor — Lane D

For **behaviour stays identical, structure improves**. If anything observable changes — a response
shape, a status code, a permission, a rendered result — it is Lane A, not this.

## What to do

1. Load the `anemal-dev-lanes` skill and read `.claude/skills/anemal-dev-lanes/references/refactor.md`.
2. ⛔ **Gate — characterization tests.** If the target code has no coverage, first write tests that
   lock **current** behaviour, including behaviour that looks wrong. No baseline, no refactor.
3. Record the baseline: test names + run result, before touching any source.
4. `@arch-agent` names the structural problem and the smallest change that fixes it
   (skills `codebase-design`, `request-refactor-plan`).
5. `@dev-agent` works in small atomic commits — every commit green, each revertable on its own.
6. ⛔ **Gate — test-set equality.** Test names after == before, both runs green. No test edited or
   deleted to make it pass; deleting one needs a recorded deleted-coverage justification.
7. ⛔ **Gate — contract unchanged.** Routes, response envelope, permission codes, public signatures.
8. ⛔ **Gate — reverse-ponytail** (`@ponytail-agent`, mode `reverse`): at least one of {files, LOC,
   abstractions, dependencies} goes **down** and none of the others goes up. All rising = a feature in
   disguise → REJECT.
9. `@scribe-agent` ships it; the before/after test list goes in the PR body.

## Scope guard

**"all / entire / whole repo / ทั้งหมด / ทั้งระบบ" → do not start editing.**
Run `/code-review` over the area, have `@arch-agent` turn the findings into a backlog ordered by
risk · payoff · existing coverage, then run one item per branch. A single branch that refactors
everything cannot be reviewed, bisected, or reverted in pieces.

Never mix a refactor with a feature or a bug fix in one branch.

$ARGUMENTS
