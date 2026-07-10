# Bugfix Pipeline Tracker — 2026-07

Scheduled task `anemal-bugfix-pipeline-resume`. 4 work items, each driven thru CLAUDE.md 8-step pipeline. Resume first incomplete item at first unchecked step.

Note (2026-07-11 run 1): found pre-existing UNCOMMITTED diff in working tree at task start (`ClinicInpatient.tsx` + test) — orphan fix renaming `temperature`→`temperatureC`, dropping nonexistent `weight` field from Log Care payload. Not from this pipeline (no tracker existed yet). Tests pass (11/11). Left in place, folded into Item 1 branch work since it touches same CareEntry/CareModal code Item 1 needs.

---

## Item 1 — Inpatient Log Care / Vitals

- [x] Step 1: /brainstorm (@pm-agent + @ba-agent) — docs/superpowers/specs/2026-07-11-inpatient-log-care-vitals-brainstorm.md (found already written by interrupted run 1, verified against fresh codebase research, adopted)
- [x] Step 2: @pm-agent tasks + AC — docs/superpowers/specs/2026-07-11-inpatient-log-care-vitals-tasks.md (Task LCV-1: Care History view; LCV-2 already done/committed b6ba152)
- [ ] Step 3: @ba-agent validate + sign-off
- [ ] Step 3.5: /grill-with-docs (MANDATORY)
- [ ] Step 4: /write-plan
- [ ] Step 5: @ponytail-agent gate
- [ ] Step 6: /execute-plan (@dev-agent / @uiux-agent / @db-agent)
- [ ] Step 7: /code-review + @qa-agent sign-off
- [ ] Step 8: /anemal-finish-branch (PR + main green + docs)

## Item 2 — Pet Profile Medical tab

- [ ] Step 1: /brainstorm
- [ ] Step 2: @pm-agent tasks + AC
- [ ] Step 3: @ba-agent validate + sign-off (Medical-tab-from-EMR design question)
- [ ] Step 3.5: /grill-with-docs (MANDATORY)
- [ ] Step 4: /write-plan
- [ ] Step 5: @ponytail-agent gate
- [ ] Step 6: /execute-plan
- [ ] Step 7: /code-review + @qa-agent sign-off
- [ ] Step 8: /anemal-finish-branch

## Item 3 — Billing pipeline (4 sub-ACs: Thai PDF font, receipt modal, filters, inpatient card detail)

- [ ] Step 1: /brainstorm
- [ ] Step 2: @pm-agent tasks + AC
- [ ] Step 3: @ba-agent validate + sign-off
- [ ] Step 3.5: /grill-with-docs (MANDATORY)
- [ ] Step 4: /write-plan
- [ ] Step 5: @ponytail-agent gate
- [ ] Step 6: /execute-plan
- [ ] Step 7: /code-review + @qa-agent sign-off
- [ ] Step 8: /anemal-finish-branch

## Item 4 — (reserved; task file lists 3 items + Item 3 has 4 sub-parts — tracking as-is, 3 top-level items total unless split further)
