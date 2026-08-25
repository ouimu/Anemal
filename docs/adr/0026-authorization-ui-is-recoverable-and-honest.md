# ADR-0026 — Authorization UI is recoverable and honest

**Status:** Accepted
**Date:** 2026-08-21
**Related:** ADR-0019 (single role per user), ADR-0024 (login identity resolution is atomic), PR #54 (INV-PERM-1)
**Origin:** `/grill-with-docs` Step 3.5 gate —
`docs/superpowers/plans/2026-08-21-auth-recovery-paths-grill.md`

## Context

Three defects in the clinic frontend shared one root cause: the UI told the user
things about their own authority that were not true, and gave them no way out
when it was wrong.

**The dead end.** `RequirePermission` redirects a denied user to `/403`, which
renders a bare centred div — icon, heading, one sentence — mounted outside
`RequireAuth` with no nav, no logout, no link. `LoginView` bounces already
authenticated users back to their dashboard, which re-triggers the same denial.
The only escape is closing the tab. A legitimately zero-permission session is a
supported state (PR #54, AC-13: `/auth/me` may return 200 with `permissions: []`),
so this is reachable without anything being broken.

**The dishonest menu.** `ClinicLayout` shows Dashboard unconditionally
(`perm: undefined`) while the route is gated on `dashboard.view`, and
`AdminLayout` applies no permission filter at all. The sidebar therefore hands
users entries that lead straight into the dead end.

**The false success.** `RoleList.handleSave` shows a "Permissions updated" toast
*before* awaiting `refreshPermissions()`, which bare-returns on any non-ok
response and whose `fetch` has no `try`/`catch`. A user who edits their own role
is told it applied while their session keeps stale permissions. Separately, a 200
carrying a malformed `permissions` field produces `permissions: []` with
`permissionsLoaded: true` — manufacturing *"you authoritatively have none"* out of
*"we could not tell"*, on the success path.

## Decision

**Every authorization denial must be recoverable, and the UI must not claim
authority the server has not confirmed.**

1. **Denials render in place, inside the shell.** The 403 becomes a child route
   under each clinic tree (`/clinic-admin`, `/clinic`, `/settings`) rather than one
   absolute page outside the layouts. The user keeps their navigation.
2. **A logout affordance is always reachable from a denial.** For a
   zero-permission session this is the only exit, so it is a requirement, not a
   convenience.
3. **The menu shows only what the user can actually open.** Accepted trade-off:
   users no longer discover features they lack access to. That is intended.
4. **Nav filtering is cosmetic and never the enforcement.** The route guard
   remains the only authorization boundary.
5. **`refreshPermissions()` has a total contract.** Every exit — success,
   malformed body, non-ok, 401, network throw, and no-token — is explicit. It may
   never set `permissionsLoaded: true` on a result it did not actually resolve.
6. **A failed self-refresh is reported honestly**, with a persistent reload
   control rather than auto-dismissing prose. A warning about known-divergent
   authorization state that erases itself after four seconds is the same defect as
   the false success, four seconds later.
7. **An ejection explains itself, on the right plane.** 401 handling carries a
   `?reason=` (reusing the `?reason=idle` precedent) and routes to the session's
   own plane.

## Consequences

**Positive**
- The dead end is structurally removed rather than papered over.
- The menu stops generating denials it could have avoided.
- INV-PERM-1 is repaired on the path that was quietly violating it: "no
  permissions" and "permissions unknown" stay distinct.
- A platform session is no longer ejected onto the clinic plane.

**Negative / risks**
- **Shape matters, and the wrong shape ships a hang.** Rendering the 403 through
  a component that reuses `ClinicLayout` reintroduces `ClinicLayout.tsx:31`
  (`if (role === 'admin') return <Navigate to="/clinic-admin/dashboard" replace/>`),
  producing an unbounded `/403` → dashboard → denied → `/403` cycle. No 403
  component may render `ClinicLayout` or `AdminLayout`, and none may re-compose
  sidebar chrome of its own.
- **Nav filtering invites a dangerous simplification.** A future engineer seeing a
  nav entry already hidden behind `hasPermission` may conclude the route's
  `RequirePermission` is redundant. Removing it would leave the capability fully
  reachable by direct URL, with the UI's silence mistaken for a guard. Decision 4
  exists to forbid exactly this.
- Hiding entries reduces feature discoverability; accepted per decision 3.
- An admin denied inside the clinic tree is relocated to their own dashboard by
  the pre-existing `ClinicLayout` redirect rather than shown the 403. This
  terminates and is accepted; nothing may depend on an admin reaching
  `/clinic/403`.

**Testing constraint**
Every acceptance criterion must **fail when the fix is reverted**. Two vacuous
assertions shipped in the same week this ADR was written — `bill-17`, which could
not detect a dropped branch clause, and a "does not flicker" criterion that passes
against the current broken code because `/403` is a terminal render with nothing
to flicker. Non-falsifiable criteria are treated as absent.

**Out of scope (backlog)**
- `SettingsLayout` filters by role *string*, which custom roles decouple from
  permissions (**B-2**).
- The remaining backlog items raised in the Step 3 sign-off (**B-1**, **B-3**, **B-4**).
