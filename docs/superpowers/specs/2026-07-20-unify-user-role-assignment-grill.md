# Grill — Unify User Role Assignment (Step 3.5, MANDATORY)

Date: 2026-07-20. Interview conducted live with the product owner after
`@ba-agent` sign-off (`docs/superpowers/specs/2026-07-20-unify-user-role-assignment-ba-signoff.md`,
APPROVE WITH CHANGES, CORR-1..CORR-5).

Input: `docs/superpowers/specs/2026-07-20-unify-user-role-assignment-design.md`
(D-1..D-8), `docs/superpowers/specs/2026-07-20-unify-user-role-assignment-tasks.md`.

## Named agenda items (per BA hand-off) — stress-tested, both stand

- **D-7 (multi-role retirement survivor rule):** re-confirmed live with the
  product owner. `doctor_a` (userId 2, holds Doctor + custom Accountant
  today) collapses to **Doctor** at migration; Accountant is dropped. This
  is the general rule for any user found holding >1 role, not a one-off.
- **D-8 (auth-plane compatibility, option (a)):** re-confirmed. Product
  owner explicitly delegated the F-1 mechanism decision to `@ba-agent`
  ("ลองตรวจสอบดูก่อนครับ ให้ BA ลอง check ดูว่าจะทำยังไงกับมันได้บ้าง") — BA's
  recommendation (legacy-string mapper confined to `auth.service.ts`) stands
  as decided.

## New finding (F-3) — `AdminBranches.tsx` doctor-picker scope, resolved

`T-URA-3.5` (BA sign-off OQ-3) flagged an open product question: should the
Admin Branches doctor-assignment picker match only the literal system
Doctor role (`role.key === 'doctor'`), or also include roles cloned from
Doctor (matching the project's existing "Bookable doctor" convention used
for appointment eligibility, which explicitly resolves via role lineage —
see `CONTEXT.md`)?

Cross-referencing `CONTEXT.md` during the grill surfaced a real potential
inconsistency: the codebase already has a precedent (Bookable doctor) for
lineage-aware doctor matching, and silently picking key-match without
naming this precedent would read as an oversight to a future engineer, not
a decision.

**Resolved with the product owner: key-match only** (`role.key === 'doctor'`,
literal system role, no lineage). Branch assignment is treated as a
distinct, narrower concern from appointment-booking eligibility — the two
screens are allowed to diverge. Recorded as ADR-0019 (with the explicit
"this is not a bug" note) and a new `CONTEXT.md` glossary cross-reference so
the divergence is discoverable, not silently inconsistent.

## New finding (F-4) — "every user must have a role" reconfirmed as absolute

Product owner explicitly reconfirmed, unprompted, during the grill: every
`User` must always hold a role — default (system) or cloned, never none.
This was already the design's stated direction (D-3: `roleId` NOT NULL) but
the owner's explicit statement removes any ambiguity for `/write-plan`: this
is not merely "the common case," it is an invariant with no valid
exception, at creation and at every point after. No design change required
— `User.roleId NOT NULL` (T-URA-1.4) already enforces this at the DB layer;
noted here so `/write-plan` doesn't relax it for any edge case (e.g. an
in-progress user-creation flow) without surfacing that as a new decision.

## New finding (F-5) — `GET /users/:userId/roles` removal, decided during grill

Not previously flagged by BA (BA's OQ-1 condition 3 only named the two
*mutation* multi-role endpoints for removal, leaving the read endpoint's
fate "decide at write-plan"). Resolved now to avoid deferring an easy call:
`GET /users/:userId/roles` (`user.routes.ts:12`, read-only, returns an array)
has no remaining consumer once `RolePicker.tsx` is deleted — the unified
Edit User modal reads the user's single role from `GET /users`'s `role`
object (`T-URA-2.3`) instead. Removed alongside the two mutation endpoints
(`T-URA-1.4`) — keeping a read endpoint that returns an array of roles would
misleadingly imply multi-role is still supported, the same "docs/API
describe a capability the code doesn't have" failure mode this whole change
exists to close.

## Outcome

No unresolved findings remain. D-7 and D-8 stand as decided; F-3, F-4, F-5
resolved and folded into ADR-0019 / `CONTEXT.md` / this doc. **Step 3.5
closed — pipeline cleared to `/write-plan` (Step 4).**
