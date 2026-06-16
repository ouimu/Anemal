# PM Scope Check — Phase 8 Sub-phases 5-A and T-5B-00

> PM-Agent · 2026-06-14
> Source spec: `.claude/specs/RBAC_Platform_Restructure_Spec.md` (SPEC-RBAC-PLATFORM-01)
> Task file: `.claude/roadmap/phase5-rbac-platform-tasks.md`

---

## 5-A Scope — APPROVED

The following four tasks are within scope for 5-A as presented. Each maps cleanly to the
Data Model Changes in §9 and the phased delivery in §13. No scope creep detected.

- [x] **T-5A-01** — Create `permissions`, `roles`, `role_permissions` tables; add `users.role_id` FK.
  Directly implements §9 DDL. `users.role` (legacy string) must be retained — not dropped.
- [x] **T-5A-02** — Seed permission catalogue + 3 system roles (`clinic_admin`, `doctor`, `clinic_staff`).
  Seeding must be idempotent; permission grid must exactly match `anemal-rbac-matrix/references/permission-matrix.md`.
- [x] **T-5A-06** — Migrate existing users: map `role='admin' -> clinic_admin`, `'doctor' -> doctor`,
  `'staff' -> clinic_staff`; set `users.role_id`. The `superadmin` migration (to `platform_users`) is
  5-C scope — NOT included here (see Out-of-scope below).
- [x] **T-5A-07** — Create `user_roles` join table (CR-01 §15 DDL); backfill one row per existing user
  from their newly set `role_id`. Zero behaviour change on day one.

**Flag — T-5A-06 partial overlap with 5-C:** The spec (§9, migration note) says "move any `superadmin`
user into `platform_users`". The 5-A plan correctly omits this — it only maps the three clinic roles.
Confirm that T-5A-06 migration script explicitly skips/leaves `superadmin` rows rather than
erroring on them, so 5-C can handle them cleanly. @db-agent must document this in the migration.

---

## T-5B-00 Scope — APPROVED

The regression-guard task is correctly scoped as a read-only baseline capture.

- [x] Write integration tests in `src/backend/tests/integration/rbac-regression.test.ts` that assert
  each of the three system roles (`clinic_admin`, `doctor`, `clinic_staff`) can reach the endpoints
  they currently reach — documenting today's behaviour before enforcement.
- [x] Tests use a `clinic_admin` token (the broadest clinic role) so they will continue to pass
  once enforcement is applied in T-5B-01+.
- [x] Must NOT add `requirePermission()`, `requirePlane()`, or any new middleware. The test file
  is purely observational. Enforcement is 5-B scope.
- [x] Tests must pass on the current codebase (before any 5-A schema changes are applied), to
  lock the pre-enforcement baseline.

**Flag — token realism:** Once T-5A-05 (JWT extension, deferred) lands, the `clinic_admin` token
will carry `roleId`+`permVersion`. T-5B-00 tests should be written so they do NOT depend on the
legacy `role` string in the JWT, or they will break when T-5A-05 runs. Recommend using a test
helper that mints a token from a seeded `clinic_admin` `role_id` so the test survives the JWT
migration without rewrite. Add a comment in the test file flagging this dependency.

---

## Out-of-scope items (deferred)

The following are explicitly outside the current 5-A + T-5B-00 plan. Any attempt to include them
is scope creep; defer to the indicated task.

| Item | Deferred to | Reason |
|---|---|---|
| T-5A-03 — Permission resolution service + Redis cache | 5-A (later step, not this plan) | Depends on T-5A-01/T-5A-02 being stable; avoid building cache before schema is seeded |
| T-5A-04 — `permission.middleware.ts` | 5-A (later step, not this plan) | Must not be applied to any route until T-5B-00 regression guard is locked |
| T-5A-05 — JWT payload extension (`roleId`+`permVersion`) | 5-A (later step, not this plan) | Token format change requires all consumers updated together |
| T-5B-01..n — Apply `requirePermission` to clinic routes | 5-B | T-5B-00 is the gate; enforcement comes after the baseline |
| T-5B-02 — Deprecate `rbac.middleware` | 5-B | Depends on T-5B-01 completion |
| T-5B-03 — Configurable role management API | 5-B | Depends on full permission model being live |
| T-5B-04 — Union permission resolution + role-assignment API | 5-B (CR-01) | Depends on `user_roles` table (T-5A-07) and middleware (T-5A-04) |
| `platform_users` table + platform auth | 5-C | Separate plane split; not in clinic-RBAC foundation scope |
| `plans` + `tenant_quotas` + quota enforcement | 5-D | Platform domain; separate sub-phase |
| Frontend shells, guards, route reorg | 5-E | Frontend restructure; depends on backend enforcement |
| Clinic role editor + Platform Console UI | 5-F | UI; depends on APIs |
| `superadmin` -> `platform_users` migration | 5-C (T-5C-03) | Platform plane split, not clinic-RBAC migration |

---

## Acceptance Criteria — §12 relevant to 5-A + T-5B-00

These are the §12 criteria that 5-A and T-5B-00 must make possible (not necessarily prove green
themselves — enforcement tests belong to 5-B). They set the contract @qa-agent verifies.

- **AC-7 (partial):** All pre-existing tenant-isolation tests still pass after T-5A-01/T-5A-07
  migrations run. Zero access regression for migrated users. The 226 existing tests must remain
  green. This is the primary stop-gate for 5-A.
- **AC-7 (T-5B-00 side):** Regression guard tests pass on today's codebase (pre-enforcement
  baseline locked). These same tests must continue to pass after T-5B-01..n enforcement is applied
  using the `clinic_admin` token.
- **AC-1 (foundation):** The schema created in T-5A-01 and the seed in T-5A-02 must lay the ground
  so that a `doctor` token can later be denied `billing.create` (403) and a `clinic_staff` token
  can be denied `emr.edit` (403) — provable once middleware is wired in 5-B.
- **AC-2 (foundation):** System role seeding (T-5A-02) must correctly grant `clinic_admin` the
  profile/staff/integration-key permissions and deny them to `doctor`/`clinic_staff` per the matrix.
- **AC-9 (CR-01, partial):** T-5A-07 `user_roles` backfill ensures every existing user has exactly
  one row so the later union-resolution (T-5B-04) starts with correct data.
- **AC-10 (CR-01, partial):** The `user_roles` schema (T-5A-07) must enforce the "remove last role
  is blocked" rule at the DB level or in the service layer by the time T-5B-04 is implemented.

---

## Sequencing note

Correct execution order within 5-A (all sequential, no parallelism until T-5A-03+):

```
T-5A-01 (schema) -> T-5A-02 (seed) -> T-5A-06 (migrate users) -> T-5A-07 (user_roles + backfill)
```

T-5B-00 can be written in parallel with T-5A-01 (it reads the current codebase, not the new
schema) but must be merged and passing before any T-5B-01 enforcement work begins.

---

## Flags summary

| # | Flag | Severity | Owner |
|---|---|---|---|
| F1 | T-5A-06 must explicitly skip `superadmin` rows (not error); document this in the migration script | Medium | @db-agent |
| F2 | T-5B-00 test helper should mint tokens using seeded `role_id` (not legacy `role` string) to survive T-5A-05 JWT extension without rewrite | Medium | @qa-agent |
| F3 | T-5B-00 must be merged and CI-green before any T-5B-01 route-enforcement PR is opened — enforce as a PR dependency | High | @pm-agent (gatekeeper) |
