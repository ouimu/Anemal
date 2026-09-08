# Lane D — Refactor / Tech Debt

**Entry:** `/anemal-refactor <scope>` · **Owner:** `@arch-agent` proposes · `@dev-agent` executes ·
`@ponytail-agent` reviews in `reverse` mode · `@qa-agent` verifies the baseline · `@scribe-agent` ships

**Definition:** external behaviour is identical before and after. If anything observable changes —
a response shape, a status code, a permission, a rendered result — it is not a refactor. Go to Lane A.

---

## 1. Sequence

```
0. ⛔ GATE — Characterization tests
   Code with no test coverage cannot be refactored. Write tests that lock CURRENT behaviour first,
   even behaviour that looks wrong — you are recording what is, not what should be. Without them
   there is no baseline, and "it still works" is an opinion.
1. Baseline    record the test names and the run result before touching any source
2. Target      @arch-agent names the structural problem and the smallest change that fixes it
               (skills `codebase-design`, `request-refactor-plan`)
3. Execute     @dev-agent — small atomic commits, every commit green, each revertable alone
4. ⛔ GATE — Test-set equality
   The list of test names after == before, and both runs green. A test may not be edited or
   deleted to make the refactor pass. Deleting one requires a recorded deleted-coverage
   justification in the PR.
5. ⛔ GATE — Contract unchanged
   Route list · response envelope · permission codes · public function signatures: identical.
6. ⛔ GATE — Reverse-Ponytail
   At least one of {file count, LOC, abstraction count, dependency count} goes DOWN,
   and none of the others goes up. All four rising = a feature in disguise → REJECT.
7. Ship        @scribe-agent — test-set evidence goes in the PR body
```

## 2. Scope guard

*all · entire · whole repo · ทั้งหมด · ทั้งระบบ* → **do not start.**

```
/code-review over the target area          → the list of problems
@arch-agent turns it into a backlog        → ordered by risk · payoff · existing coverage
each backlog item = one /anemal-refactor   → one branch, one review, one revert point
```

A single branch refactoring everything cannot be reviewed, cannot be bisected, and cannot be reverted
in pieces. The backlog is not bureaucracy — it is what makes the work safe to land.

## 3. Branch and commit

```
chore/<short-description>  or  refactor/<short-description>     branch from main
refactor(<scope>): <the structural change>
```

Never mix a refactor with a feature or a bug fix in one branch. When a refactor branch goes red, the
cause must be unambiguous.

## 4. PR body

- the structural problem, and the change that fixes it
- **test names before and after** — the equality evidence
- the reverse-ponytail count: what went down, and confirmation nothing else went up
- an explicit statement that no contract changed
- an ADR link if a structural decision was made that outlives this branch

## 5. Escalate out of this lane when

| Discovery | Go to |
|-----------|-------|
| a test goes red and it *should* be red — behaviour genuinely changes | Lane A |
| the "refactor" needs a schema change | Lane A, Step 3.4 |
| a real bug surfaces while restructuring | separate Lane B branch — do not fix it here |

## 6. What a good target looks like

Duplication that has drifted · a god service with several reasons to change · business logic sitting
in a controller, repository, or React component · scattered booleans encoding a state machine
(`architecture-rules.md` §6) · a magic constant that should be a tenant-scoped value
(`architecture-rules.md` §7) · an interface with one implementation (delete the interface, not the class).
