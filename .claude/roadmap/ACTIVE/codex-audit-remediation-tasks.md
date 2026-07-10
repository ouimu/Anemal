# Codex QA Audit Remediation — Pipeline Tracker

> Source: `RecomendByCodex/` (00-06 + 3 agent evidence files), generated 2026-07-07
> Orchestration: main session acts as coordinator, dispatching per CLAUDE.md Agent Router table (no separate orchestrator agent file — `@pm-agent`/`@ponytail-agent`/`@qa-agent` already own that role).
> Pipeline per batch: Step1 brainstorm → Step2 pm tasks → Step3 ba sign-off → Step3.5 grill (MANDATORY) → Step4 write-plan → Step5 ponytail gate → Step6 execute-plan → Step7 qa → Step8 finish-branch.
> Resume rule: if session ends mid-batch, re-enter here, find first unchecked step in the in-progress batch, continue. Do not re-run completed steps.

## Batch 1 — Stop-ship (do first)

Items (from `06-recommendations.md` "Stop-ship / fix first"):
- BUG-001 (Critical): platform audit logs may store plaintext secrets — redact secret-like fields before audit persistence
- BUG-002/BUG-003: Platform Customer/Plan create-edit frontend payloads don't match backend Zod schema (`trialEndsAt`; `price`/`features` shape)
- BUG-004: Platform settings PUT fails on nullable optional SMTP fields
- BUG-005: test-clinic doctor_b/staff_b seed/branch-assignment drift blocks login
- BUG-008: platform audit "today" date-window filter test fails (timezone/window bug)

Pipeline status: `✅ COMPLETE 2026-07-07`
- [x] Step 1 brainstorm (folded into BA analysis — scope confirmed from audit docs)
- [x] Step 2 pm-agent tasks+AC (BA doc contains per-bug fix approach + constraints)
- [x] Step 3 ba-agent sign-off (2026-07-07, Ready for grill: YES, Q1-Q5 open)
- [x] Step 3.5 grill-with-docs — DONE: Q1-Q5 answered by product owner + BUG-008 root-caused; decisions in docs/adr/0003-codex-audit-batch1-stopship-decisions.md (D1 scrub+rotate; D2 trial→Phase10; D3 features=boolean flags; D4 backend nullable; D5 seed rerun+deactivate dupes; D6 pure-UTC date filters)
- [x] Step 4 write-plan → docs/superpowers/plans/2026-07-07-codex-audit-batch1.md (6 tasks, order T1→T5→T6→T2→T3→T4, branch fix/codex-audit-batch1-stopship)
- [x] Step 5 ponytail gate — APPROVE (all 7 criteria pass, ADR fidelity verified, 2026-07-07)
- [x] Step 6 execute-plan — 6/6 tasks done, commits 1a9ab1c..d94fa62 (+094d715 stale-test fix); backend 554 + frontend 138 tests green; scrub script redacted 67/5168 audit rows; 5 duplicate users deactivated; seed re-run OK, all HOW-TO-RUN credentials login
- [x] Step 7 qa-agent sign-off — ✅ SIGN-OFF 2026-07-07 (554+138 tests re-verified independently, D1-D6 diff-audited, non-vacuity probe passed, scrub idempotent 0/5426 residual)
- [x] Step 8 finish-branch — PR #8 merged (871af98), main re-verified green (554+138), HTML docs updated + pushed (9fefca6)

## Batch 2 — Next high-value fixes

- Decide/implement or formally defer `/platform/users`, `/platform/usage`
- Per-tenant provisioning UI (currently placeholder) + verify secret masking end-to-end
- BUG-006: grooming status update frontend calls wrong route
- BUG-007: platform company-types frontend wrong path/client
- BUG-010: platform login frontend identity hydration (`data.user` vs top-level)
- BUG-009: vaccination create permission mismatch (`vaccination.create` vs `emr.create`) — align docs/frontend/backend/tests
- BUG-011: `/settings/preferences` route not plane-guarded on frontend

Pipeline status: `✅ COMPLETE 2026-07-07 — PR #9 merged (6bde86e), main verified green (554+143), HTML docs updated + pushed (9d49032). All steps 1-8 passed.`
Batch 2 Steps 1-3 done: BA sign-off 2026-07-07, zero open questions. Decisions: BUG-006 frontend URL fix only; BUG-007 platformApi client; BUG-009 vaccination.create canonical (App.tsx:145 change; audit's matrix-stale claim FALSE — read stale .agents/skills/ copy, which gets deleted); BUG-010 frontend maps data.user; BUG-011 RequirePlane clinic wrap; 4 deferrals (platform users/usage/provisioning-UI → explicit doc marking, customer deletion → Phase 10).

## Batch 3 — QA automation to add (per 06-recommendations.md)

- Seed credential smoke test (every documented credential + branch selection)
- Role-route matrix test (200/403 per role per tenant per route)
- Platform contract tests (frontend DTO shapes vs backend Zod schemas)
- Secret audit regression test (sentinel secrets never appear in plaintext in platform_audit_logs)
- Browser smoke pass after API green

Pipeline status: `✅ COMPLETE 2026-07-07 — PR #10 merged (711b130), main verified green (832+143), HTML docs pushed (11ef487). Double QA sign-off. Matrix: 148 routes × 3 roles, zero RBAC gaps. All steps 1-8 passed.`
Batch 3 BA sign-off 2026-07-07: items 1+4 mostly delivered in Batch 1 (gaps: platform credential in seed smoke; settings_audit_logs third sink assertion). New builds: roleRouteMatrix.test.ts (dynamic router walk + permissionCode annotation + seed-rbac grants import; allowed=NOT{401,403}, denied=403, unmapped-route-fails guard) + platformContract.test.ts (safeParse vs exported Zod + type-only frontend DTO import). Browser smoke: manual anemal-smoke-walkthrough skill formalized as gate; Playwright deferred Phase 10/11.

## Batch 4 — Documentation repair (05-documentation-gaps.md)

- Build canonical FR/route status matrix (FR ID, route, impl status, backend/frontend/test evidence, release status)
- Update README, HOW-TO-RUN, RBAC matrix, platform spec, screen specs from that matrix
- Fix `/admin/*` vs `/clinic-admin/*`, username-vs-email login wording, phase/test-count drift, stack-version drift

Pipeline status: `✅ COMPLETE 2026-07-08 — PR #11 merged (0bd2db6), main verified green (832+143), HTML docs pushed (2437bfa). All steps 1-8 passed.`

---

# 🏁 REMEDIATION COMPLETE — 2026-07-08

All 4 batches shipped through the full Step 1-8 pipeline. PRs #8, #9, #10, #11 merged; ADRs 0003-0006 recorded; backend tests 447 → 832, frontend 138 → 143; main green after every merge.

## Release gate (per RecomendByCodex/06-recommendations.md)
- [x] All seeded credentials can log in — seedCredentialSmoke.test.ts (clinic 6 + platform), green
- [x] Platform mutation contracts green — Batch 1 fixes + platformContract.test.ts (8 contracts vs real Zod)
- [x] Targeted backend integration tests pass — full suite 832/832 incl. rbac-regression, platformAuth, platform-console-t5f02
- [x] Browser smoke — formally converted to manual release gate (qa-protocols Protocol 5 + anemal-smoke-walkthrough skill); automation deferred Phase 10/11 per ADR-0005 D5. Run the manual walkthrough before UAT/release.
- [x] All Critical/High bugs resolved or formally deferred — BUG-001..011 fixed; deferrals explicit (trial→Phase 10, platform users/usage/provisioning-UI/deletion → documented, ADR-0004 D6)
Batch 4 BA sign-off 2026-07-07: DOC-1 status matrix (.claude/specs/implementation-status-matrix.md, module-level ~30 rows); DOC-2 fix HOW-TO-RUN (email→username creds — actively harmful) + README (React 19→18.3 etc.) + CLAUDE.md phase row; DOC-3 surgical edits 7 screen-spec files (incl. transfers/PromptPay/PDF/presign now-implemented corrections); DOC-4 ~10 new screen specs DEFERRED with write-on-next-touch rule. Docs-only, 0 code.

## Batch 5 — Post-fix re-audit findings (2026-07-08 runtime re-verification)

New re-audit (RecomendByCodex/, re-run after Batches 1-4 merged) confirmed most fixes hold at runtime, but found:
- **P1** BUG-001 residual: direct `platformAuditLog.create` calls (e.g. `plan.update` service) bypass the middleware-only redaction — secret sentinel confirmed raw in DB (`details.changes.features.nested.apiToken`)
- **P1** BUG-007 residual: company-type DTO mismatch — `label` vs `nameEn`/`nameTh`, customer detail missing top-level `companyTypeId` (edit-and-save can silently clear company type)
- **P2** platform settings `featureFlags` accepted by PUT, silently not persisted (GET still `{}`)
- **P2** plan quota frontend allows submit of `maxBranches=0`/`maxUsers=0` that backend 400s
- **P2** platform settings audit actor identity not yet proven (clinic userId vs platform identity)
- **P3** legacy role-string navigation (custom/multi-role UX gap), vaccination branch-scope decision still open, frontend test console noise (UsageTab)

Note: `.claude/specs/implementation-status-matrix.md`, CLAUDE.md, README.md and 6 other files already carry uncommitted edits on disk (pre-dating this tracker entry) that accurately reflect these findings — verified via `git diff`, not discarded. These fold into Batch 5's Step 8 commit rather than being redone.

Pipeline status: `✅ COMPLETE 2026-07-09 — PR #12 (b1628e8) + PR #13 (70e84b3) merged, HTML docs pushed (98cbcb0). All steps 1-8 passed both sub-batches.`

**Known non-blocking issue (out of RecomendByCodex scope):** `seedCredentialSmoke.test.ts` doctor_b/staff_b @ test-clinic fails after a full suite run — some OTHER test's cleanup mutates/deletes `user_branches` for tenant-2 non-admin users as a side effect. Reseed (`npm run db:seed` from src/backend) always restores it; re-running the full suite reintroduces it. This is a test-isolation bug in an unrelated suite, not a login/seed correctness bug — confirmed via isolated re-run passing cleanly right after reseed. Filed separately (task_aee5937e, chip already offered to user). Not a Codex audit finding; do not re-open as part of this remediation.
- [x] Step 1 brainstorm (folded into BA)
- [x] Step 2 pm-agent tasks+AC (folded into BA)
- [x] Step 3 ba-agent sign-off (2026-07-08, fable model)
- [x] Step 3.5 grill-with-docs — PASS (opus), 6 mandates folded into ADR-0007
- [x] Step 4 write-plan (5A + 5B, 2026-07-08-codex-audit-batch5{a,b}.md)
- [x] Step 5 ponytail gate — both APPROVE
- [x] Step 6 execute-plan — 5A: 2 commits (a05c0aa, 14d6cbd). 5B: 8 commits (2a558cd..8494096)
- [x] Step 7 qa-agent sign-off — both ✅ SIGN-OFF (5A flagged+root-caused doctor_b drift, fixed via reseed; 5B flagged D2-timing-gap, fixed via follow-up commit; both flagged pre-existing seedCredentialSmoke concurrency flake — filed as separate task, not blocking)
- [x] Step 8 finish-branch — PR #12 merged (b1628e8), PR #13 merged (70e84b3)
- [x] Step 1 brainstorm (folded into BA)
- [x] Step 2 pm-agent tasks+AC (folded into BA fix designs)
- [x] Step 3 ba-agent sign-off (2026-07-08, fable model, zero open questions, D1-D6c decided)
- [x] Step 3.5 grill-with-docs (MANDATORY) — PASS, F1.2/F2.1/F3.2/F4.2/F6c/FX.1 mandates folded into ADR-0007
- [x] Step 4 write-plan (5A: 2026-07-08-codex-audit-batch5a.md, 5B: 2026-07-08-codex-audit-batch5b.md)
- [x] Step 5 ponytail gate — both APPROVE
- [x] Step 6 execute-plan — 5A 2 commits, 5B 8 commits
- [x] Step 7 qa-agent sign-off — both ✅ SIGN-OFF
- [x] Step 8 finish-branch — PR #12 + PR #13 merged, HTML docs pushed (98cbcb0)

## Release gate (do not consider audit remediation done until)

- [x] All seeded credentials can log in (incl. branch selection) — re-verified at runtime 2026-07-08; known test-isolation flake in an unrelated suite documented above, not a login/seed defect
- [x] Platform mutation contracts green (customer/plan/settings) — company-type contract fixed (5A/D2), quota validation aligned (5B/D4), featureFlags dead field removed (5B/D3)
- [x] Targeted backend integration tests pass (rbac-regression, platformAuth, platform-console-t5f02)
- [x] Browser smoke completes without timeout — platform + clinic walkthrough passed 2026-07-08
- [x] All Critical/High bugs resolved or formally deferred by product — Batch 5 P1s fixed (audit redaction gap closed via repo choke-point, company-type contract fixed); all P2/P3s fixed or explicitly documented as intentional (vaccination scope, legacy nav backlog)

---
**Delete this file only when all batches + release gate are checked off.**

## RecomendByCodex/ file-by-file confirmation (2026-07-09, explicit final pass)

Every file in this folder read and cross-checked against Batch 5's actual delivery:

- [x] `00-executive-summary.md` — verdict/findings all map 1:1 to Batch 5A/5B decisions
- [x] `01-verification-evidence.md` — every runtime finding (audit redaction, company-type, quota, featureFlags) traced to its fix
- [x] `02-fixed-vs-still-open.md` — all "still open" items (BUG-001 residual, BUG-007 residual) closed by 5A; all "items to keep open" closed or explicitly deferred by 5B
- [x] `03-new-bugs-and-gaps.md` — all 7 P1-P3 items dispositioned (D1-D6c)
- [x] `04-documentation-updates.md` — matrix/platform-domain/inventory/README updates all folded in via 5B T6; **one item missed on first pass, now fixed**: `RBAC_Platform_Restructure_Spec.md` staleness (commit 8ee1ebc)
- [x] `05-claude-next-action-list.md` — all 6 action items + verification commands covered
- [x] `agent-clinic-rbac-reverify.md` — source-level evidence consistent with 5B's D6a/D6b decisions
- [x] `agent-platform-reverify.md` — source-level evidence (JWT shape, redaction gap) matches ADR-0007 D1/D5
- [x] `runtime-clinic-rbac-recheck.md` — all findings pass/resolved, legacy-nav + vaccination-scope items match D6a/D6b
- [x] `runtime-docs-recheck.md` — doc consistency confirmed; `selectionToken` vs `pendingToken` wording checked (grep clean, no stale references found, no action needed)
- [x] `runtime-platform-recheck.md` — both confirmed bugs (audit redaction, company-type) map to 5A D1/D2; quota + featureFlags map to 5B D3/D4

**Nothing else outstanding.** RecomendByCodex/ intentionally stays untracked (source audit input, not a project doc) — final commit 8ee1ebc closes the loop.

---

# Post-remediation closeout task (2026-07-09)

Also completed since: seedCredentialSmoke flake ROOT-CAUSED + FIXED (commit 4e78e0b — user.repository.test.ts used unscoped findFirst, wiped real doctor_b's branch assignment via replaceUserBranches; now isolated fixtures; 3/3 clean full runs).

4 phases, 2-hourly resume cron a6282858 (self-deletes on completion):
- [x] Phase 1: QA walkthrough (fable) ✅ — 7/7 logins, full role matrix PASS, redaction DB-verified 2×, ZERO real bugs, 835+143 green. All 11 files verdict DELETE. Notes: dev-DB QA fixture rows left (QA*/qa_walk_*, harmless); optional seed-exactness test idea (Low, backlog).
- [x] Phase 2: RecomendByCodex/ folder deleted entirely (all findings resolved, verdicts recorded in Phase 1 report)
- [x] Phase 3: doc cleanup ✅ — commit fc36e56 pushed (43 files, +126/−1359): 17 plans + 2 roadmap files archived, 9 obsolete artifacts deleted, all doc claims synced to 835/143 + Batches 1-5 complete. First agent died at session limit mid-work; completion agent (fable) verified all partial edits, fixed its botched ADR headers, caught 5 missed items (HOW-TO-RUN counts, RBAC spec path, uiux SKILL dead paths, DESIGN.md table).
- [x] Phase 4: HTML sync ✅ — commit b9c4201 pushed: counts 835/143 everywhere, archived-path refs fixed, closeout changelog block added.

# ✅ CLOSEOUT COMPLETE 2026-07-09 — all 4 phases done. Zero open findings anywhere. Cron a6282858 deleted.
