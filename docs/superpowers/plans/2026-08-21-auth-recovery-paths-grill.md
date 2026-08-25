# Grill Record — Auth Recovery Paths (AUTH-BL-1/2/3, F-5, N-1)

**Pipeline step:** 3.5 (`/grill-with-docs`) — MANDATORY gate before `/write-plan`
**Date:** 2026-08-21
**Branch:** `fix/auth-recovery-paths`
**Inputs:**
- `docs/superpowers/plans/2026-08-21-auth-recovery-paths-pm-tasks.md` (@pm-agent, Step 1+2 — 15 AC)
- `docs/superpowers/plans/2026-08-21-auth-recovery-paths-ba-signoff.md` (@ba-agent, Step 3 — APPROVED WITH CONDITIONS, C-1…C-11, AC 15→22, PM overruled on architecture)

**Outcome:** ALL FINDINGS RESOLVED — gate PASSED, `/write-plan` unblocked.

---

## 1. Claims verified rather than trusted

@ba-agent overruled @pm-agent on the central architectural choice, so its load-bearing
claims were checked against source before being accepted.

| Claim | Verified |
|---|---|
| `ClinicLayout.tsx:31` redirects admins out of the clinic tree | **Confirmed verbatim** — `if (role === 'admin') return <Navigate to="/clinic-admin/dashboard" replace />` |
| `ClinicLayout.tsx:11` shows Dashboard unconditionally | **Confirmed** — `perm: undefined`, while the route is gated on `dashboard.view` |
| `AdminLayout.tsx:76` applies no permission filter | **Confirmed** — `NAV.map(item => <NavLink …>)`, no filter of any kind |
| `/platform/*` emits no 403 | **Confirmed** — no `RequirePermission` in the platform tree |
| Relative `<Navigate>` is available (C-4) | `react-router-dom ^6.23.0` — v6 supports relative navigation. C-4 still stands: @dev-agent must verify **behaviour**, not just availability |

The decisive one is `ClinicLayout:31`. Under @pm-agent's preferred shape (b), an admin
landing on the absolute `/403` rendered through a shell that reuses `ClinicLayout` would
bounce to `/clinic-admin/dashboard`, be denied, and return to `/403` — **an unbounded
loop**. The proposed fix for a dead end would have shipped a hang. Shape (a) is adopted
(C-1); shape (b) is rejected.

---

## 2. Human ruling

**R-1 — hide nav items the user cannot open.** The sidebar currently shows every entry
regardless of permission, so a user can be handed a menu item that leads straight to the
dead end this branch exists to remove. Asked in plain terms; the human chose hiding over
leaving the menu intact and relying on a now-recoverable 403.

Accepted trade-off, stated so nobody re-litigates it later: users no longer discover
features they lack access to. That is the intended behaviour, not an oversight.

---

## 3. Findings raised during grilling

### G1 — The F-3 fix makes the zero-permission empty sidebar *real* (interaction, not a defect)

@pm-agent's AC asserted that a zero-permission user's sidebar "renders empty".
@ba-agent correctly showed that is **false today** — `ClinicLayout` always shows Dashboard
and `AdminLayout` filters nothing, so the sidebar renders at least one item, and that item
is a trap.

Once R-1 lands, the claim becomes **true**: a zero-permission user's sidebar really is
empty. This is worth stating explicitly because it changes the status of a requirement —
the logout affordance in A1 stops being defence-in-depth for a hypothetical state and
becomes **the only way out** for a real one. The two changes must therefore ship together;
shipping the nav filter without the logout affordance would deepen the trap it is meant to
relieve.

**RESOLVED — plan must couple R-1 and the 403 logout affordance in the same change.**

### G2 — Hiding nav is cosmetic and must never become the enforcement

Nav filtering changes what is *shown*. It does not change what is *permitted*. The route
guard remains the only enforcement.

Recorded as an invariant because the failure mode is attractive and quiet: a future
engineer sees a nav item already hidden behind `hasPermission` and concludes the
`RequirePermission` on the route is redundant. Removing it would leave the capability fully
reachable by direct URL, with the UI's silence mistaken for a guard.

**RESOLVED — invariant recorded in ADR-0026; plan must not weaken any route guard.**

### G3 — An admin never sees the clinic-tree 403, and that is acceptable

Under shape (a), a `/clinic/403` child route renders inside `ClinicLayout`, which bounces
admins to `/clinic-admin/dashboard`. So an admin is silently relocated rather than told
why.

Checked for a cycle: the admin lands in their own tree, where `AdminLayout` performs no
such redirect, so it terminates. If the admin also lacks the admin-dashboard permission
they reach `/clinic-admin/403`, which renders. No loop.

Accepted: admins are redirected out of the clinic tree by pre-existing intended design, so
`/clinic/403` is effectively unreachable for them. The plan must simply not *depend* on an
admin being able to see it.

**RESOLVED — no change; documented so it is not mistaken for a bug later.**

### G4 — F-2 confirmed on the happy path

`authStore.ts` `refreshPermissions()` does
`permissions: Array.isArray(body.permissions) ? body.permissions : []` and then
`set({ ...patch, permissionsLoaded: true })`.

So a **200** carrying a malformed `permissions` field yields an empty array flagged as
authoritative — manufacturing *"you definitively have no permissions"* out of *"we could
not tell"*. That collapses the exact INV-PERM-1 distinction PR #54 established, and it
happens on the success path, not an error path. One malformed response drops a full admin
into the zero-permission state.

Same defect class as the N-1 fix already being applied to `fetchMe`; `refreshPermissions`
was simply never audited for it.

**RESOLVED — in scope, must be fixed alongside AUTH-2.**

### G5 — Falsifiability is the gate condition, not a nicety (C-11)

Two vacuous assertions have already shipped this week: `bill-17`, which could not detect a
dropped branch clause, and @pm-agent's "does not flicker" AC, which **passes against the
current broken code** because `/403` is a terminal render with nothing to flicker.

Every AC in this branch must fail when the fix is reverted. This is a QA gate condition,
not a style preference.

**RESOLVED — C-11 carried into the plan as a hard requirement.**

---

## 4. Scope decisions

**Included, over the original brief:**
- **C-9 / F-4** — the `api.ts` 401 interceptor. It is the *dominant* 401 path (every API
  call), so fixing only `refreshPermissions` would leave AUTH-BL-1's own acceptance
  criteria false for the overwhelming majority of real 401s. Two one-line changes at two
  existing redirect sites; not a redesign.
- **C-9 / F-7** — plane-correct 401 destination. Both handlers currently hard-code the
  clinic `/login`, ejecting a platform session onto the wrong plane.
- **F-2** (G4 above).
- **R-1** nav filtering, capped at two edits per C-10.

**Deferred:**
- `SettingsLayout` role-string filtering → backlog **B-2**. It filters by role *string*,
  which custom roles decouple from permissions — a real gap, but a different one, and
  fixing it here would turn a bounded change into a nav redesign.
- `AUTH-403-04` **withdrawn** — no production code sets `authStore.plane = 'platform'`, so
  it specified behaviour for an unreachable state.

---

## 5. Tenant-isolation / RBAC review

- No query, route, or permission code changes. Enforcement is untouched; only the client's
  recovery affordances and one client-side cache-population path change.
- The change is isolation-**improving**: F-2 stops the client fabricating an authoritative
  empty permission set, and F-7 stops a platform session being ejected onto the clinic
  plane.
- INV-PERM-1 preserved: `permissionsLoaded === true` means server-resolved; `false` means
  unknown; neither may be read as "empty". G2's invariant protects the guard layer.
- Zero-permission ≠ unauthenticated (C-6): `RequireAuth` on the 403 route checks
  `isAuthenticated()` only, never permissions.

---

## 6. Carried into `/write-plan`

1. Shape (a) — 403 child routes under the three trees (C-1); shape (b) rejected (C-3).
2. Couple R-1 nav filtering with the 403 logout affordance — same change (G1).
3. Fix F-2 alongside AUTH-2 (G4).
4. Include the `api.ts` interceptor and plane-correct destination (C-9).
5. Verify the relative-redirect behaviour before relying on it, with a named fallback (C-4).
6. Every AC falsifiable against pre-fix code (C-11, G5).
7. Nav hiding is cosmetic — no route guard may be weakened (G2).
8. Fold all of C-1…C-11 into the task list.

**Gate status: PASSED.**
