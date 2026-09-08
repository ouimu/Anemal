# Lane B — Bug Fix

**Entry:** `/anemal-fix-bug <symptom>` · **Gates:** one (root-cause) + QA + ship
**Skipped from Lane A:** brainstorm · BA sign-off · `/grill-with-docs` · arch · ponytail

A bug is behaviour that is already wrong. Nothing here designs anything — if the fix requires design,
this is the wrong lane (see §5).

---

## 1. Sequence

```
0. Capture     symptom · who hit it · which tenant/role/plane · steps to reproduce
1. Reproduce   write a FAILING test that reproduces it   (skill `tdd`)
2. Root cause  name it in one sentence                   (skill `diagnosing-bugs`)
   ⛔ GATE — no production code may be edited until BOTH exist:
      a failing test that reproduces, and a named root cause.
      "I think it is X" is not a root cause; the failing test proves it.
3. Fix         @dev-agent — smallest change that turns the test green
4. Regression  @qa-agent — full suite green; the new test stays permanently;
               if the bug touched tenant scoping, add the isolation test too
5. Ship        @scribe-agent — /anemal-finish-branch
```

## 2. Why the gate is placed there

Editing before reproducing produces a fix for a guess. The failing test is also the only proof the
bug is gone, and the only thing that stops it coming back. A bug fixed without a test is a bug
scheduled to return.

## 3. Branch and commit

```
fix/<short-description>              e.g. fix/appointment-double-book-409
fix(<scope>): <what is now correct>  e.g. fix(auth): return 401 on expired refresh token instead of 500
```

Branch from `main`. Commits atomic; the test and the fix may share a commit, but the test must be
visible in the diff.

## 4. PR body

- symptom and who it affected
- **the named root cause**
- the failing test, and that it now passes
- full suite result
- no test removed — or a deleted-coverage justification

## 5. Escalate out of this lane when

| Discovery | Go to |
|-----------|-------|
| the fix needs a schema change or a migration | Lane A, Step 3.4 |
| the fix changes an API contract, response shape, or permission code | Lane A, Step 3.4 |
| more than 3 files must change | Lane A, Step 3.4 |
| the root cause is "the design does not support this case" | Lane A, Step 3.4 |
| production is actively broken right now | Lane C |

Escalating is not a failure — it is the mechanism that keeps this lane cheap and honest.

## 6. Stop immediately and escalate to the human

A query returning another tenant's data · a role below `clinic_admin` reading financial data · PII in
logs · an offline action overwriting server data without conflict detection. These are Lane C
territory and a security matter, not a bug ticket.
