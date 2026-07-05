# Design: Fix Missing Doctor List in Appointment Booking

**Date:** 2026-07-05
**Status:** Grill complete, all findings resolved — ready for /write-plan (Step 4), pending Ponytail Gate (Step 5)

## Problem

Creating an appointment shows no doctor in the doctor dropdown. Booking cannot
be saved (doctor is required).

## Root Causes (2, stacked)

1. **Wrong permission gate.** Frontend fetches doctors via `GET /users`
   (`ClinicAppointments.tsx:271`), which requires `staff.view`
   (`user.routes.ts:11`). Only `clinic_admin` holds `staff.view`
   (`seed-rbac.ts:126`) — `clinic_staff` and `doctor` do not
   (`seed-rbac.ts:137`, `:154`). Any non-admin opening the booking form gets a
   403 on this call, so the doctor list renders empty.

2. **No branch/role-lineage scoping.** Even with permission fixed, the
   current code:
   - Does not filter by branch at all — `findUsers(tenantId)`
     (`user.service.ts:38`) returns every tenant user; client only filters by
     legacy `role === 'doctor'` string (`ClinicAppointments.tsx:294`).
   - Does not recognize custom roles cloned from the system "Doctor" role
     (`cloneRole`, `role.service.ts:77`) — `ClinicRole` has no lineage column,
     so a clinic that renames/customizes "Doctor" loses doctor-list
     membership for those users.

## Design

### New endpoint

`GET /api/appointments/doctors`

- Permission: `appointments.view` (held by `clinic_admin`, `clinic_staff`,
  `doctor` — everyone who can open the booking form).
- **No `branchId` query param.** Branch scope comes solely from
  `req.context.branchId` (same `branchOf(req)` helper already used by
  `listAppointments`/`createAppointment` in `appointment.controller.ts`).
  When `req.context.branchId` is `null` ("all-branches" admin token), the
  repository applies no branch filter and returns doctors across every
  branch in the tenant — identical fallback to the existing appointment-list
  behavior. Client cannot request a different branch than its own token is
  bound to (closes BA-1 and BA-2 in one move — no new logic, reuse of an
  established pattern).
- Returns bookable doctors for that resolved branch scope only.

### Doctor membership rule

A user counts as a doctor if **any** of their assigned roles
(`UserRole` → `ClinicRole`) resolves to the Doctor system role:

- `ClinicRole.key === 'doctor'` (the system role only — custom roles are
  always slugged `tenant_<id>_<slug>` by `createRole`, so this arm can never
  match a custom role; confirmed during BA review), OR
- `ClinicRole.sourceRoleId` points (directly) to the system Doctor role.

Multi-role users qualify if any one of their roles satisfies this — no need
for all roles to be Doctor-derived.

Additional filters (resolved during grilling):
- Exclude `User.isActive = false` — deactivated staff never appear.
- Response fields: `{ id, name }` only — no email/phone/username exposed via
  this `appointments.view`-gated path.
- Legacy `User.role = 'doctor'` (pre-RBAC-migration accounts with no
  qualifying `UserRole` row) is **not** matched by default. Gated on the DB-2
  read-only check below: if it finds affected users, add a `UserRole`
  backfill for them (preferred) rather than a permanent legacy-string
  fallback in the query (avoid two competing sources of truth long-term).

### Branch scoping

Filter via existing `UserBranch` join table (already populated today by
admin's branch-assignment UI — no change to that assignment flow), keyed off
`req.context.branchId` per above (never a client-supplied value).

### Filter-by-doctor dropdown (calendar view)

Reuses the same bookable-doctor list. If a doctor is later unassigned from
a branch, they drop off this filter's options — past appointments they were
on remain fully visible and correctly attributed via "All doctors"; only the
ability to filter specifically by that doctor's name is lost. Accepted as-is
(BA-6) — no broader "all doctors ever assigned" list is built for this.

### Schema change

Add nullable `ClinicRole.sourceRoleId Int?` (self-referencing FK to
`ClinicRole.id`, `ON DELETE SET NULL` — if a system role were ever deleted,
dependent clones simply lose the lineage tag rather than being blocked or
cascaded; system roles are seeded and not deleted in practice, so this is a
belt-and-suspenders choice, not a real operational path). Set by `cloneRole`
(`role.service.ts:77`) when cloning from the system "Doctor" role. One
migration, no data backfill needed for existing clones (they simply won't
retroactively count as doctor-derived until re-cloned or manually linked —
acceptable, flagged as known gap below).

### Components touched

- `prisma/schema.prisma` — add `sourceRoleId` column + migration
- `role.service.ts` `cloneRole` — set `sourceRoleId` on the created row
- `appointment.repository.ts` — new `findDoctorsForBranch(tenantId, branchId)`
- `appointment.controller.ts` + `appointment.routes.ts` — new route
- `ClinicAppointments.tsx` — replace `/users` doctor-fetch with new endpoint;
  drop client-side `role === 'doctor'` filter

### Error handling

Empty result (no doctor assigned to branch) is a valid, expected state — not
an error. UI shows "No doctor assigned to this branch — contact your admin"
instead of a blank dropdown with no explanation, and the Save button stays
disabled with that message visible.

### Known gap (out of scope for this fix, call out explicitly)

Existing custom roles already cloned from "Doctor" before this fix will not
have `sourceRoleId` set (no backfill). If a tenant has such a role today, its
users still won't appear as doctors until an admin re-clones the role or a
manual data fix is applied. Not addressed here — flag to BA/PM whether a
backfill migration is warranted based on real tenant data.

## Testing

- RBAC: `clinic_staff` and `doctor` can call the new endpoint (200, not 403);
  `clinic_admin` too.
- Branch scoping: users assigned to branch A don't appear when querying
  branch B.
- Clone lineage: user with a custom role whose `sourceRoleId` → Doctor system
  role is included.
- Multi-role: user with one Doctor-derived role + one non-Doctor role is
  included.
- Tenant isolation: query never crosses `tenantId`.

## BA Sign-off (Step 3, 2026-07-05)

**Verdict: CONDITIONAL — 2 blocking gaps (BA-1, BA-2) must be resolved before
/grill-with-docs closes and /write-plan runs. Authorization model itself is APPROVED.**

### Authorization validation (approved)

- `appointments.view` is the correct gate. Verified held by all three system roles
  (`seed-rbac.ts:107,137,156`; matrix row V/V/V). Everyone who can open the booking
  form can populate the dropdown; deny-by-default preserved; no new permission code
  needed (standard-config-before-custom).
- No privilege escalation: endpoint discloses strictly less than the old `GET /users`
  path (which needed `staff.view`), and doctor names are already visible to
  `appointments.view` holders via `appt.doctor.name` in the list view.
- OR-membership rule is sound **and simpler than the spec states**: `createRole`
  (`role.repository.ts:78-84`) slugs every custom-role key as
  `tenant_<id>_<slug>` — a custom role can never have `key === 'doctor'`, so that
  arm matches only the system role and cannot be spoofed. Spec wording "a custom
  role that happens to reuse this key" is impossible; correct the wording.
- Direct (non-transitive) `sourceRoleId` is sufficient today because `cloneRole`
  only clones system roles (`findRoleByName(sourceRoleName, null)`). **Constraint
  recorded:** if clone-of-custom-role is ever allowed, the membership rule must
  become transitive.
- Tenant isolation: `UserBranch` carries `tenantId` with
  `@@unique([tenantId,userId,branchId])`; DEV-2 AC already mandates `tenantId` at
  every join. OK.

### Blocking gaps

```
ID: BA-1 (BLOCKER)  Objective: admin books appointments in all-branches mode
AS-IS: JWT/authStore branchId may be NULL ("all-branches" admin bypass,
       useAuth.ts:22, authStore.ts:14); appointment create accepts branchId null.
Gap:   Design makes branchId a REQUIRED query param (DEV-3: missing -> 400).
       A clinic_admin in all-branches mode has no branchId to send -> the exact
       bug this fix targets reappears for admins.
TO-BE: Define behaviour for null branch context. Recommendation: derive branch
       from req.context.branchId; when it is null, accept ?branchId (validated
       tenant-owned) OR return all tenant doctors when omitted.
Acceptance: admin with branchId=null token can populate the dropdown and save.

ID: BA-2 (BLOCKER)  Objective: branch scoping is a server-side boundary, not a hint
AS-IS: Design takes branchId solely from the client query string.
Gap:   A branch-A-bound clinic_staff token can enumerate branch B's doctor list
       (cross-branch read not otherwise available to that token). UI passing the
       param is UX; server is the security boundary.
TO-BE: Server uses req.context.branchId when non-null (ignore or 403 on mismatched
       query param); query param honored only for all-branches (null) tokens,
       validated as belonging to tenantId.
Acceptance: branch-A staff token querying branchId=B gets branch-A data or 403,
       never branch-B data.
```

### Must-fix (resolvable during grill, not blocking sign-off)

- **BA-3** Legacy `User.role = 'doctor'` (LegacyRole column kept "until 5-C",
  `schema.prisma:144-146`): membership rule reads only `UserRole -> ClinicRole`.
  Extend DB-2's read-only check: count users with legacy role `doctor` but no
  qualifying `UserRole` row. If > 0, backfill `UserRole` (preferred) — no-access-
  regression rule applies since AS-IS UI filters on the legacy string.
- **BA-4** Exclude `isActive = false` users from the doctor list (missing from
  spec + ACs).
- **BA-5** Response field whitelist `{ id, name }` only — no email/phone/username;
  `appointments.view` must not become a staff-contact-data read path.
- **BA-6** Doctor *filter* dropdown (calendar, `ClinicAppointments.tsx:345-352`)
  reuses the same list: existing appointments may reference a doctor later
  unassigned from the branch — filter can no longer select them. Grill item.

### DB-2 ruling (backlog vs launch blocker)

**Ruling: launch-gate check with a conditional trigger — not a design blocker;
grill/write-plan may proceed in parallel with the check.**

Reasoning: (1) No production tenants are plausible yet — Phases 10-11 (payments,
LINE) are still blocked on credentials, so real paying clinics cannot exist;
expected finding is zero. (2) Detection post-hoc is only heuristic anyway (keys
are tenant slugs, so lineage can't be recovered from `key`; match on permission-
set-equals-Doctor or name), which is exactly why the check must run *before*
launch while the population is small. (3) Impact if missed is per-tenant silent
doctor-list loss — the same bug re-manifesting, admin-recoverable only via
re-clone + user reassignment (painful).

Conditions: if the DB-2 check finds **>= 1** affected custom role in any real
tenant, a one-time `UPDATE clinic_roles SET "sourceRoleId" = <doctor-id>` data
fix for the identified rows joins THIS fix's scope before merge (trivial,
reviewed by @db-agent) — do not ship the endpoint while a known tenant stays
broken. If **0** found (expected), the recurring check goes on the production
launch checklist as backlog. DB-2 additionally absorbs the BA-3 legacy-role
count (same read-only pass).

## Grill (Step 3.5, 2026-07-05) — findings, all resolved

| # | Question | Resolution |
|---|----------|------------|
| Q1 | Where does branch scope come from? | `req.context.branchId` only (server session), matching `branchOf(req)` already used elsewhere in `appointment.controller.ts`. No client-supplied `branchId` param. Closes BA-1 (null → all-branches fallback, same as existing behavior) and BA-2 (client cannot enumerate other branches) in one move. |
| Q2 | Legacy `role='doctor'` fallback? | Deferred to DB-2 read-only check. 0 affected users → no fallback code (YAGNI). >0 → backfill `UserRole` rows for them, not a permanent legacy-string branch in the query. |
| Q3 | Include deactivated users? | No — `isActive=false` always excluded. |
| Q4 | Response fields? | `{ id, name }` only. No email/phone/username. |
| Q5 | Doctor filter dropdown (calendar) when a doctor is reassigned off a branch? | Accept as-is (BA-6): they drop off the filter's options; past appointments remain fully visible/correct via "All doctors." No broader all-time-doctors list built. |
| Q6 | `sourceRoleId` FK behavior if system Doctor role is ever deleted? | `ON DELETE SET NULL` — clone survives, just loses the lineage tag. System roles aren't deleted in practice; this is defensive, not a real path. |

No unresolved findings remain. BA-1 and BA-2 (blockers) are closed by Q1.
DB-2 (launch-gate check, not a design blocker) still executes as its own
task (see task breakdown) before merge, per its existing conditional-trigger
ruling above.
