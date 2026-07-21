# ADR-0019 — Single Role Per User Retires Multi-Role (FR-14b/CR-01)

- **Status:** Accepted
- **Date:** 2026-07-20
- **Branch:** (to be created at `/write-plan`)
- **Context doc:** `docs/superpowers/specs/2026-07-20-unify-user-role-assignment-design.md`,
  `docs/superpowers/specs/2026-07-20-unify-user-role-assignment-ba-signoff.md`,
  `docs/superpowers/specs/2026-07-20-unify-user-role-assignment-tasks.md`
- **Produced by:** Step 3.5 `/grill-with-docs` (mandatory gate), human present —
  findings resolved live with the product owner.

## Context

The Clinic Admin "Edit User" modal exposed two independent, uncoordinated
role-assignment systems: a legacy hardcoded `role` enum listbox
(admin/doctor/staff) and a separate RBAC "Roles" section (`RolePicker`) for
custom cloned roles. Cloned roles (e.g. "Accountant") were invisible in the
listbox — the reported bug. Saving the legacy listbox silently wiped any
custom-role assignment via `replaceUserRole()`'s single-role replace.

`@ba-agent`'s independent DB verification found this was not hypothetical:
the dev database's `userId 2` (`doctor_a`) actively holds **two** roles today
— system `Doctor` plus custom `Accountant` — exercising multi-role
end-to-end, including its own permission-union resolution
(`permission.service.ts`), dedicated write endpoints, and documented spec
coverage (`anemal-functional-reqs` FR-14b, `anemal-rbac-matrix` CR-01).

## Decision

**Users hold exactly one role, always.** Combined access is achieved by
cloning a role with the right permission mix (e.g. "Doctor + Accounting"),
not by stacking multiple roles on one user. This retires FR-14b/CR-01 as a
deliberate, documented supersession — not a silent narrowing:

- `User.roleId` becomes `NOT NULL`; the legacy `User.role` enum column and
  `LegacyRole` type are dropped entirely.
- The multi-role write endpoints (`POST/DELETE /clinic/roles/users/:userId/roles`)
  and the now-redundant read endpoint (`GET /users/:userId/roles`) are
  removed server-side — leaving them live would let any `staff.assign_role`
  holder recreate a multi-role user via direct API call, reintroducing the
  exact two-truth drift this change exists to kill.
- **Migration survivor rule** for any user found holding >1 role at cutover:
  the **system** role wins over any custom role (e.g. `doctor_a` keeps
  Doctor, loses the Accountant assignment). A user holding 2+ system roles,
  or 2+ custom roles with no system role, is **not** auto-resolved — it halts
  into a manual-resolution report; the migration does not proceed for that
  case until an admin resolves it. Every collapse is logged (user, kept
  role, removed roles) and attached to the migration PR — auditable, not
  silent.
- Every `User` must always have exactly one role — there is no valid
  "roleless" user state, at creation or at any point after.

### A related, narrower decision: `AdminBranches.tsx`'s doctor picker stays key-match, not lineage-aware

The project's existing `CONTEXT.md` glossary defines **Bookable doctor**
(used for appointment-assignment eligibility) as resolving "via role
lineage" — i.e. a role cloned from Doctor counts as a doctor there. Grilling
surfaced this as a potential inconsistency: should the Admin Branches
doctor-assignment picker follow the same convention?

**Decision: no, deliberately.** `AdminBranches.tsx`'s doctor picker matches
`role.key === 'doctor'` only — the literal system Doctor role, not clones.
This is a **narrower, distinct scope from "Bookable doctor"**: branch
assignment is an operational/administrative concern (which physical doctor
works which branch), not a clinical-eligibility concern (who can be booked
for an appointment). The two screens are allowed to diverge; this is not an
oversight to "fix" later by unifying them.

## Consequences

- `anemal-functional-reqs` (FR-14b) and `anemal-rbac-matrix` (CR-01,
  `permission-matrix.md` §5) must be updated in the same change to describe
  the single-role model — they must never describe a capability the product
  doesn't have (task URA-5).
- A future engineer reading `AdminBranches.tsx` next to the "Bookable
  doctor" glossary entry might assume the two should use the same
  eligibility logic. This ADR is the answer to "why don't they."
- If a real future need arises for `AdminBranches` to include cloned
  Doctor-derived roles, that is a new, separate decision — not a bug fix.
