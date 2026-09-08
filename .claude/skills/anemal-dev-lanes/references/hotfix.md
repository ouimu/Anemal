# Lane C — Hotfix

**Entry:** `/anemal-hotfix <symptom>` — **a human must type it.** An agent never declares a hotfix.
**Gates:** at least one test · isolation intact · follow-up recorded · ship gate
**Skipped (recorded exemption):** brainstorm · BA · `/grill-with-docs` · arch · ponytail

---

## 1. Qualifies only if one of these is true

- production is down, or a live endpoint returns 5xx
- data is being corrupted — written wrongly, overwritten, or lost
- a security failure: auth bypass · cross-tenant leak · PII in logs
- `main` is red on the backend suite

**Does not qualify** — send to Lane B: a UI glitch · a typo · slow but working · a missing feature ·
"it would be embarrassing at the demo". Urgency is not the criterion; *ongoing harm* is.

## 2. Sequence

```
0. Declare      human states: symptom · impact (who, how many tenants) · since when
1. Pin          one test that locks the correct behaviour — not a full TDD cycle
2. Patch        the smallest change that stops the harm
   ⛔ HARD CAP: no schema change · no new migration · no API contract change.
      Needing one means this is not a hotfix — stop and escalate. A rushed schema
      change under incident pressure is more dangerous than the original bug.
3. Verify       full backend suite + the isolation/RBAC tests touching the affected area
   ⛔ If the incident was a cross-tenant leak, its isolation test is PERMANENT — never temporary.
4. Ship         @scribe-agent — /anemal-finish-branch with the HOTFIX block
5. Follow-up    ⛔ GATE: merge is blocked without an entry under "Open hotfix debt"
                in .claude/roadmap/index.md pointing at a Lane A or Lane B item
6. ADR          required if the hotfix changed behaviour that an ADR or spec had settled
```

## 3. Branch and commit

```
hotfix/<short-description>     branch from main
fix(<scope>): <what stopped>   subject says what the harm was, not what the code does
```

Back-merge is not applicable here — this repo has no `staging` branch, despite what
`.claude/skills/anemal-coding-rules/references/06-github-workflow.md` still says. Branch from and merge to `main`.

## 4. PR body — the HOTFIX block, all four fields

```
## HOTFIX
Symptom:    <what was observed>
Impact:     <who was affected · how many tenants · duration>
Exemptions: <which pipeline steps were skipped — list them>
Follow-up:  <link to the Lane A/B item and the roadmap/index.md entry>
```

Missing any field = `@scribe-agent` blocks the merge.

If `main` was red and this branch is the fix, add which tests were red and that this branch turns them
green — that is the documented ship-gate exemption, not a bypass.

## 5. What can never be skipped

Even under incident pressure: at least one test · tenant isolation intact · the follow-up entry.
Everything else in the pipeline is negotiable here; these three are not.

## 6. After the incident

The follow-up item carries the real fix through Lane A or B. `@scribe-agent` removes the debt entry
only when that item ships. Debt that survives more than one phase is raised to the human by
`@pm-agent` during status review.
