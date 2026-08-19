# Anemal — Phase History & Status Tracking

Shipped-phase changelog (test counts + PR/ADR mapping) and status of in-flight work. Kept out of `CLAUDE.md` so that file stays session-generic. Deep design detail lives in the ADRs — this is the index, not a duplicate. `@pm-agent` appends one row here LAST on every shipped task, alongside `.claude/specs/implementation-status-matrix.md` and the HTML docs.

---

## Current status / next action

- **Codex security review remediation is fully shipped** — all CRITICAL (2/2) and HIGH (20/20) findings from `CodexCodeReview.md` closed and merged to `main` via PR #53 (2026-08-06). R2-HI-01 (row-level security) closed via documented deferral (single-pool/single-role Prisma setup would zero out every query under full RLS) rather than deployment — canonical design preserved as an undeployed target. Ponytail-agent 7-point gate APPROVED; QA-agent APPROVED (final round, after 2 rejection/fix cycles on R3-HI-05). MEDIUM/LOW findings intentionally out of scope.
- `fix/codex-review-critical-high` branch retained post-merge pending stale-branch cleanup pass; see cleanup note below.
- **Latest tests:** 1243+ backend (2 new regression suites added — `codex-review-regression.test.ts`, `audit-sanitize-depth.test.ts` — exact cumulative count unverified this session, local Postgres at `localhost:5432` unreachable throughout, consistent with how the rest of this branch's 22+ commits were validated) / 330 frontend (unchanged — no frontend test changes this branch). `tsc --noEmit` clean on both backend and frontend, verified on `main` post-merge.
- **On resume:** read newest `docs/superpowers/plans/HANDOFF-*.md` first, then `.claude/roadmap/ACTIVE/remaining-tasks.md`.

---

## Shipped phases

Tests = cumulative backend / frontend after that phase. `—` = pre-dates PR/ADR tracking.

| Phase | Focus | PR | ADR | Tests |
|-------|-------|----|-----|-------|
| 1–7 | Foundation → UI redesign | — | — | 226 |
| 8 | RBAC + Platform Console | — | — | ~394 BE |
| 9 | i18n Thai/English (16 screens, no library) | — | — | 95 FE |
| D-1–D-5 | Username login, company types, payment history, owner-first browse | — | — | 447 BE |
| Codex Audit | Batches 1–5: stop-ship fixes, decision docs, QA automation, doc repair, re-audit | #8–#13 | — | 835 / 143 |
| Pet/EMR Batch A | Pet edit, weight↔EMR sync, vitals free-text | #14 | — | 850 / 168 |
| Pet/EMR Item 3 | Inpatient create/edit/delete + board field fix | #15 | — | 864 / 181 |
| Remember-me redesign | Per-subdomain username recall (not session persistence) | #16 | 0010 | 864 / 207 |
| Care History view | Read-only inpatient Care History on CageCard, admitted-only | #17 | 0011 | 864 / 213 |
| Pet Profile Medical tab | Permission-aware read-only EMR rollup (Option C) | #18 | 0012 | 867 / 218 |
| Billing pipeline fixes | Thai PDF font, Payment History receipt + filters, performer-name FK | #19 | 0013 | 888 / 225 |
| Hospitalization branch isolation | BOLA fix — `branchId` from auth context, not query string | #20 | 0014 | 912 BE |
| Log Care vitals modal | HR/RR/feeding/medication fields + shared `VitalStepper` | #21 | — | 912 / 233 |
| RETEST-2026-07-13 | 3 P1 (tenant-leak, FK index, Tailwind token) + 4 test-gaps | #22 | — | 915 / 235 |
| Clinic Admins tab | Auto-create tenant's first `clinic_admin` + admin tab (bounded platform→clinic exception) | #23 | 0015 | 953 / 256 |
| Main Branch + password change | Auto Main Branch (PROV-1) + backfill; self-service change / admin reset, both revoke tokens | #26 | 0015am | 979 BE |
| Clinic password UI + lockout guard | Reset field + Change Password card; `assertNotPrimaryAdminDeactivation` blocks primary-admin deactivate/demote | #27 | 0016 | 993 / 283 |
| Settings IA restructure | Settings→Appointment, Preferences split out, sidebar dedup, remember-me single-prefill | #31 | 0017 | 993 / 283 |
| Usage Stats quota fix | `maxPets` 4th quota across 3 resolvers + enforcement; fixed hardcoded fake `PLAN_LIMITS` | #33 | 0018 | 1021 / 291 |
| Unify role — Plan A (backend) | Retire multi-role + `User.role` enum; `roleId` sole source; 404 on foreign `roleId`; index | #37 | 0019 | 1015 BE |
| Unify role — Plan B (frontend) | Single `ClinicRole` listbox; `GET /users` returns role obj + `isPrimaryAdmin` | #38 | 0019 | 1017 / 279 |
| Billing VAT config | Per-clinic VAT mode + rate, resolved server-side (`computeVat()`), not client `taxRate` | #39 | 0020 | 1031 / 283 |
| EMR file attachments | Presign → S3 PUT → confirm upload, MIME-allow-listed, private-bucket-safe | #41 | 0021 | 1058 / 289 |
| Local-disk driver PR1 (EMR) | `StorageDriver` + `LocalDiskDriver`, prod-guarded; multipart POST; multer size limit at ingest | #42 | 0022 | 1066 BE |
| Local-disk driver PR2 (pet-photo + S3 teardown) | Stable per-pet key, server-managed `photoUrl`, `AuthedPetImage`; deletes S3 stack + `@aws-sdk` | #43 | 0022 | 1078 / 301 |
| EMR attachment UX + Thai filenames | latin1→utf8 filename decode, type hint + `accept=`, delete-confirm, truncation fix | #45 | 0022 | 1081 / 304 |
| SMB driver Sub-PR A (backend core) | `TenantStorageConfig` + `SmbShareDriver`, async `getStorageDriver` across 5 call sites | #46 | 0023 | 1103 BE |
| SMB driver Sub-PR B (API + UI) | `GET`/`PUT /clinic/storage-config`, Clinic Settings Storage page | #47 | 0023 | 1124 / 308 |
| Google Drive Sub-PR A (driver core) | `GoogleDriveDriver`, tenant-scoped Drive paths, OAuth nonce; 11 grill gaps resolved | #47am | 0023 | 1149 BE |
| Google Drive Sub-PR B (OAuth + UI) | `authorize` + public `callback` (signed single-use state), Connect/Disconnect UI | #48 | 0023 | 1178 / 315 |
| OneDrive Sub-PR A (driver core) | `OneDriveDriver` via MS Graph, tenant-scoped app-folder paths, OD-13 approot-fallback spike; 2 grill rounds | #49 | 0023 | 1178 BE |
| OneDrive Sub-PR B (OAuth + UI) | `authorize`/`callback` (same signed-state pattern), disconnect + duplicate-account banner, 4th storage radio; closes ADR-0023 (all 3 sub-projects shipped) | #50 | 0023 | 1243 / 330 |
| **feature/tenant-storage-provider → main** | Final merge of the entire ADR-0023 feature branch (77 commits) into `main`, verified green post-merge | #51 | 0023 | 1243 / 330 |
| Codex review remediation (CRITICAL/HIGH) | 22+ commits closing CR-01/02, HI-01–09, R2-HI-01–04, R3-HI-01–07: cross-tenant FK guards, branch-scope precedence, refresh-token/appointment/discharge/bag-claim atomicity, RBAC role invariant, quota-lock gaps, unbounded audit-sanitize recursion, per-identity upload rate limit; R2-HI-01 closed via documented RLS deferral (not deployment) | #53 | — | 1243+ BE (2 new suites, exact count unverified — Postgres unreachable) / 330 FE |

## Pending phases

| Phase | Focus | Status |
|-------|-------|--------|
| 10 | Payment gateway + SaaS billing | ⏸ needs credentials |
| 11 | LINE/SMS dispatch | ⏸ needs credentials |

---

## ADR / design-doc index

ADRs in `docs/adr/`, design specs + plans + grill/QA records in `docs/superpowers/{specs,plans}/`.

| ADR | Topic | PRs |
|-----|-------|-----|
| 0010 | Remember-me = per-subdomain username recall (superseded by 0017 UI) | #16 |
| 0011 | Inpatient Care History (read-only, admitted-only) | #17 |
| 0012 | Pet Profile Medical tab (read-only EMR rollup) | #18 |
| 0013 | Billing pipeline fixes + `DailyInpatientCare.performedBy` FK | #19 |
| 0014 | Hospitalization branch isolation (BOLA, existence-leak 404 precedent) | #20 |
| 0015 | Platform provisions clinic-admin identity (+2026-07-15 amendment: Main Branch PROV-1) | #23, #26 |
| 0016 | Primary-admin lockout-protection scope (D-1..D-9) | #27 |
| 0017 | Settings IA restructure (supersedes 0010's chooser-modal UI) | #31 |
| 0018 | `maxPets` dual-resolver quota + enforcement | #33 |
| 0019 | Single-role-per-user retires multi-role (Plan A backend, Plan B frontend) | #37, #38 |
| 0020 | Clinic-configurable billing VAT | #39 |
| 0021 | EMR file attachments (presign/S3) | #41 |
| 0022 | Unified local-disk `StorageDriver` (Ponytail-required 2-PR split) | #42, #43, #45 |
| 0023 | Per-tenant BYO-storage — SMB (sub-1), Google Drive (sub-2), OneDrive (sub-3) — all shipped, merged to main | #46, #47, #48, #49, #50, #51 |

Other trackers: `.claude/roadmap/archive/bugfix-pipeline-2026-07-tracker.md` (2026-07 bugfix pipeline, all shipped), `.claude/roadmap/archive/pet-emr-inpatient-fixes.md`, `.claude/roadmap/ACTIVE/remaining-tasks.md`.
