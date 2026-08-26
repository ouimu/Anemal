# P5 Browser Smoke — Auth Recovery Paths (ADR-0026)

**Pipeline step:** 7 — `anemal-smoke-walkthrough`, QA finding **F-1**
**Date:** 2026-08-26
**Branch:** `fix/auth-recovery-paths`
**Run by:** coordinator (QA blocked on this; it cannot be satisfied from a test runner)

**Environment:** local Postgres :5432 (seeded), backend `:4000`, frontend `:5173`.
Account: `doctor_a` / tenant `dev-clinic`, branch *Downtown Branch*, **20 permissions**
— notably WITHOUT `billing.create`, `grooming.view` or `clinic.integrations.edit`,
which is what makes it a usable denial subject.

**Result: ALL PASS.** No finding.

---

## S-1 — Nav honesty (human ruling R-1)

After login, the sidebar renders exactly six entries:

```
/clinic/dashboard  /clinic/pets  /clinic/appointments
/clinic/emr        /clinic/inventory  /clinic/inpatient
```

**Billing and Grooming are absent**, and `hasBillingCreate: false` confirms why.
Before this branch both would have rendered — `ClinicLayout` gave Dashboard
`perm: undefined` and every other entry was shown regardless — so a doctor could
tap Billing and be thrown into the dead end. The menu now offers only what it can
actually deliver.

## S-2 — The dead end is gone (AUTH-BL-3, the reported defect)

Navigated directly to `/clinic/billing`, a route `doctor_a` cannot open:

```
{ path: "/clinic/403", hasSidebar: true, navLinkCount: 6,
  signOutReachable: true, scrollOverflow: 0 }
```

**PASS.** The denial renders *in-shell*: the sidebar is present with six working
links, so the user can simply navigate away. Sign-out is reachable. Previously
this was a bare centred div outside `RequireAuth` with no nav, no logout and no
link — escapable only by closing the tab.

`scrollOverflow: 0` independently confirms the @uiux-agent fix: `ForbiddenView`'s
root was `h-screen`, correct when it was a standalone page but a full-viewport box
nested inside a `main` that is already `min-h-screen overflow-y-auto` with
`pt-16`. Changed to `min-h-[60vh]`; there is no double-scroll.

## S-3 — Two-segment-deep denial (the case that decided the architecture)

This is the scenario the whole mechanism turns on. Navigated to
`/settings/storage/connecting`:

```
{ path: "/settings/403", landedOnSettings403: true, notDeepNested: true,
  hasShell: true, scrollOverflow: 0 }
```

**PASS**, and it distinguishes the shipped design from both rejected ones:

| Approach | Would resolve to |
|---|---|
| relative `<Navigate to="403" relative="path">` | `/settings/storage/403` ✗ |
| relative `<Navigate to="403" relative="route">` | `/settings/storage/connecting/403` ✗ |
| a `startsWith` tree-prefix map | needs longest-prefix logic or `/clinic-admin/*` lands in `/clinic/403` ✗ |
| **`pathname.split('/')[1]`** (shipped) | **`/settings/403`** ✓ |

Also note this exercises the **third tree**, which the pre-existing
`App.routing.test.tsx` omitted entirely — the gap @qa-agent found.

## S-4 — Stale bookmark to the deleted absolute `/403`

`<Route path="/403">` was deleted rather than kept as a fallback (@ponytail-agent's
call, over @ba-agent's C-2). Navigated to `/403` directly:

```
{ path: "/clinic/dashboard", hasSidebar: true, navLinkCount: 6,
  signOutReachable: true, stillAuthenticated: true }
```

**PASS.** The chain runs catch-all → `/login` → `LoginView`'s authenticated bounce
→ dashboard, which `doctor_a` *can* open, so it renders. The session survives.

Worth stating plainly: a stale bookmark now lands the user somewhere **useful**
rather than on a dead page. That is strictly better than the standalone fallback
it replaced, which is exactly the argument for deleting it.

## S-5 — No redirect cycle

Every navigation above settled on a stable path with no flicker and no repeated
history entries. The `LoopGuard` added to `App.realRouting.test.tsx` covers this
mechanically (verified: making `ForbiddenView` render `ClinicLayout` fires the
guard 12 times and fails the file in 2.34 s rather than hanging).

---

## Console / network

One `403` on `/api/reports/snapshot`, from the clinic dashboard.

**Not a finding, and not caused by this branch.** `doctor_a` lacks
`reports.revenue.view`, so the server is correctly denying a request the dashboard
makes unconditionally. The server enforcing its own guard is the system working.
It is pre-existing behaviour — the dashboard calls an endpoint without checking
whether the caller may — and it is arguably worth tidying, but it is out of scope
here and unrelated to the 403 recovery path. Logged for the backlog.

The `Viewport height is too small: 0` entry is a harness artefact of the
non-compositing browser pane.

---

## S-6 — `clinic_admin` pass (added after @qa-agent's re-review flagged the gap)

QA noted the first pass walked only `doctor_a`, leaving `AdminLayout` — which
gained a permission filter it **previously lacked entirely**, the branch's largest
nav change — with no live coverage. Closed here.

Logged in as `admin_a` (48 permissions). Because an admin holds every permission,
nothing filters, so that alone would not exercise the new code. Simulated a custom
admin role by removing two permissions from the live session and reloading:

```
removed: ['audit.view', 'roles.view']   permissions 48 -> 46

navLinks: dashboard, clinic-profile, users, usage, settings, subscription, blood-bank
{ auditHidden: true, rolesHidden: true, usersStillShown: true }
```

**PASS.** Exactly the two corresponding entries disappeared (9 → 7); everything
else stayed. Before this branch `AdminLayout` rendered `NAV.map(...)` with no
filter of any kind, so both would have been shown and both would have led into
the dead end.

Then the security half — **ADR-0026 decision 4: nav hiding is cosmetic, never
enforcement.** Navigated directly to `/clinic-admin/audit`, now hidden from the
menu:

```
{ path: "/clinic-admin/403", deniedInShell: true, auditContentLeaked: false,
  hasSidebar: true, navLinkCount: 7, signOutReachable: true, scrollOverflow: 0 }
```

**PASS.** The hidden entry is still enforced by its route guard: the URL is denied
in-shell, no audit content renders, and the user can navigate away. This is the
invariant the route-manifest test protects mechanically; here it is confirmed
against the running app.

## Coverage against the AC set

| Case | AC / finding | Result |
|---|---|---|
| S-1 nav hides inaccessible entries | R-1, F-3 (nav honesty) | PASS |
| S-2 in-shell denial, navigable, logout reachable | AUTH-BL-3, AUTH-403-05 | PASS |
| S-2 no double-scroll | @uiux-agent `h-screen` fix | PASS |
| S-3 two-segment-deep denial → tree root | C-4, the segment derivation | PASS |
| S-3 third tree exercised | @qa-agent gap in `App.routing.test.tsx` | PASS |
| S-4 stale absolute `/403` bookmark | @ponytail-agent C-2 reversal | PASS |
| S-5 no cycle on any path | ADR-0026 central hazard | PASS |
| S-6 AdminLayout filter hides unheld entries | R-1, F-3 (admin tree) | PASS |
| S-6 hidden entry still denied by its route guard | ADR-0026 decision 4 | PASS |

Write-path cases (skill step 5) were not exercised: this branch changes no
write path — it touches denial rendering, nav filtering and the permission-refresh
result contract only.

Not exercised live: the zero-permission session (no seeded role has zero
permissions; covered by two cases in `App.realRouting.test.tsx`), and the
self-role-edit refresh failure (needs an induced server failure mid-edit; covered
by `RoleList.test.tsx` AUTH-REFRESH-01/02/03/05, all mutation-verified).
