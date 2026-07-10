# Bugfix Pipeline Tracker — 2026-07

Scheduled task `anemal-bugfix-pipeline-resume`. 4 work items, each driven thru CLAUDE.md 8-step pipeline. Resume first incomplete item at first unchecked step.

Note (2026-07-11 run 1): found pre-existing UNCOMMITTED diff in working tree at task start (`ClinicInpatient.tsx` + test) — orphan fix renaming `temperature`→`temperatureC`, dropping nonexistent `weight` field from Log Care payload. Not from this pipeline (no tracker existed yet). Tests pass (11/11). Left in place, folded into Item 1 branch work since it touches same CareEntry/CareModal code Item 1 needs.

---

## Item 1 — Inpatient Log Care / Vitals

- [x] Step 1: /brainstorm (@pm-agent + @ba-agent) — docs/superpowers/specs/2026-07-11-inpatient-log-care-vitals-brainstorm.md (found already written by interrupted run 1, verified against fresh codebase research, adopted)
- [x] Step 2: @pm-agent tasks + AC — docs/superpowers/specs/2026-07-11-inpatient-log-care-vitals-tasks.md (Task LCV-1: Care History view; LCV-2 already done/committed b6ba152)
- [x] Step 3: @ba-agent validate + sign-off — SIGN-OFF granted; 1 correction applied (backlog filing for deferred vitals-input fields added to remaining-tasks.md)
- [x] Step 3.5: /grill-with-docs (MANDATORY) — docs/superpowers/specs/2026-07-11-inpatient-log-care-vitals-grill.md — 6 findings, all resolved (2 filed to backlog: performedBy name resolution, branch isolation on GET /:id; Finding 5 corrected by Finding 6 + ADR-0011: discharged-history unreachable from this board, deferred to Item 2)
- [x] Step 4: /write-plan — docs/superpowers/plans/2026-07-11-inpatient-log-care-vitals.md (4 tasks, 2 files, 0 new endpoints/permissions/deps)
- [x] Step 5: @ponytail-agent gate — APPROVE, all 7 criteria clear
- [x] Step 6: /execute-plan (@dev-agent) — CareHistoryModal + CageCard button + cache-invalidation fix implemented in ClinicInpatient.tsx + test file; 16/16 file tests, 213/213 full suite, typecheck+lint clean; uncommitted pending QA sign-off
- [x] Step 7: /code-review + @qa-agent sign-off — code-review APPROVE (pm-agent self-review of diff, clean); QA SIGN-OFF, fixed 1 minor AC deviation (temperature decimal formatting, .toFixed(1)), tenant isolation confirmed pre-covered (phase4.test.ts:163), RBAC surface confirmed zero new, 213/213 frontend + 864/864 backend green
- [ ] Step 8: /anemal-finish-branch (PR + main green + docs) — PR #17 open (https://github.com/ouimu/AnimalClinic/pull/17), CLEAN/MERGEABLE, 213/213 frontend + 864/864 backend green, typecheck clean. NOT merged — anemal-finish-branch's git-safety rule is "never merge without being asked" and no human is present in this autonomous run to give that go-ahead. Merge-and-verify-main-green + anemal-HTML-updater (the doc sync) still pending — run those next once a human merges PR #17, or explicitly authorizes an agent to merge it. Resume here.

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
