# P5 Browser Smoke — Branch-Select Login Flash Fix

**Pipeline step:** 7 (QA), plan task **T20** + `anemal-smoke-walkthrough` Protocol 5
**Date:** 2026-08-20
**Branch:** `fix/branch-select-login-flash`
**Run by:** coordinator (human started local Postgres; QA had blocked on infra)

**Environment:** local Postgres :5432 (seeded), backend `:4000` (ts-node-dev), frontend
`:5173` (Vite). Tenant `dev-clinic` (2 branches: Main Branch, Downtown Branch).
Viewports exercised: **768×1024** (tablet portrait) and **1024×768** (tablet landscape).

**Result: ALL PASS.** No finding. Screenshots were unavailable in this session (the
browser pane was not compositing), so every claim below is backed by DOM state,
`sessionStorage` contents, or the network log rather than a picture — stronger
evidence for these particular assertions in any case.

---

## Method note — how the flash was actually measured

A screenshot cannot prove the absence of a sub-100 ms render. Instead a detector was
installed **while the branch picker was on screen and before the branch was tapped**:

```js
window.__flash = { loginFormSeen: 0, events: [] }
const check = (why) => {
  if (document.querySelector('#username') || document.querySelector('#password')) {
    window.__flash.loginFormSeen++
    window.__flash.events.push({ at: …, why, path: location.pathname })
  }
}
new MutationObserver(() => check('mutation')).observe(document.body, { childList: true, subtree: true })
setInterval(() => check('poll'), 1)
```

A `MutationObserver` on the whole subtree plus a **1 ms** poll. Either the credentials
form enters the DOM and is caught, or it never enters. This is the direct negation of
the reported bug.

---

## S-1 — Primary bug: no login flash (AC-1) · doctor_a · 768×1024

`doctor_a` / 2 branches → picker rendered → detector armed → tapped **Downtown Branch**.

```
{ loginFormSeenCount: 0, events: [], elapsedMs: 10616,
  finalPath: "/clinic/dashboard", hasSidebar: true }
```

**PASS.** Zero login-form renders across 10.6 s of continuous observation. Landed
directly on `/clinic/dashboard`. The reported symptom is gone.

## S-2 — Exactly one `/auth/me` (AC-2)

Network log for the full login:

```
POST /auth/login         → 200
POST /auth/select-branch → 200
GET  /auth/me            → 200      ← one, not two
```

**PASS.** The duplicate identity call is gone. Confirmed again on each subsequent
login: one `/auth/me` per successful login, no more.

## S-3 — Session correctly established (AC-3, AC-11)

```
{ path: "/clinic/dashboard", name: "Doctor A", role: "doctor",
  branchId: 2, branchName: "Downtown Branch",
  permCount: 20, permissionsLoaded: true }
```

**PASS.** `permissionsLoaded: true` is persisted in the new explicit shape, the JWT is
scoped to the branch actually tapped, and the dashboard rendered (heading "แดชบอร์ด")
with no `RequirePermission` spinner.

## S-4 — Network drop mid-select: atomic failure (AC-9, AC-12) · T20's core case

`/auth/me` was made to reject with `TypeError('Failed to fetch')` — a genuine network
drop, not an HTTP error code — while the picker was on screen, then a branch was tapped:

```
{ path: "/login",  sessionStorageAuth: null,  localStorageAuth: null,
  pickerStillVisible: true,  loginFormBack: false,  meCallCount: 1,
  visibleError: "Could not load your permissions. Please try again." }
```

**PASS on every clause of ADR-0024:** no `setAuth`, nothing in `sessionStorage` or
`localStorage`, no navigation, picker still mounted, and **not** bounced back to the
credentials form.

This also confirms **F-2 is fixed**: a raw network throw now produces the specific
identity message. Before the fix it would have read "Could not select branch" — naming
the half that actually succeeded — or, on the direct path, "Invalid credentials", telling
a user with a correct password that it was wrong.

The message shown is the new `login.selectBranchIdentityError`, visibly distinct from
`login.selectBranchError`. This is exactly the ruling the human gave at the grill gate.

## S-5 — Retry after failure (grill finding G1)

Network restored, **the same branch button re-tapped** — no re-typing, no new login:

```
{ retrySucceeded: true, path: "/clinic/dashboard",
  branchName: "Downtown Branch", permCount: 20, permissionsLoaded: true,
  loginFormFlashDuringRetry: 0, totalMeCalls: 2 }
```

**PASS.** G1's load-bearing backend property — `pendingToken` is reusable, verification
in `selectBranch()` is stateless — is now confirmed **against the real backend**, not
just by the unit test. `totalMeCalls: 2` = one failed attempt + one retry, i.e. still
exactly one per attempt. And no flash on the retry path either.

## S-6 — F-1 deploy-day regression: pre-fix session blob

The highest-stakes check. A blob of the **exact shape old `refreshPermissions()`
persisted** was written to `sessionStorage` — `permissionsLoaded: false` alongside a
fully populated 20-entry `permissions` array — then the dashboard was loaded:

```
{ path: "/clinic/dashboard", spinnerOnly: false, hasSidebar: true,
  bodyTextStart: "Dev Clinic | Downtown Branch | menu_open | dashboard | แดชบอร์ด | pets | สัตว์เล" }
```

**PASS.** Fully rendered dashboard, no infinite spinner. The `normalise()` OR-fallback
rescues real pre-fix blobs. Without this fix every user with a live session would have
hung on the first reload after deploy.

## S-7 — Admin bypass unchanged (AC-4) · admin_a

```
{ path: "/clinic-admin/dashboard", name: "Admin A", role: "admin",
  branchId: null, branchName: "All Branches",
  permCount: 48, permissionsLoaded: true }
```

**PASS.** No picker shown, `branchId` null (all-branches scope), correct label, admin
dashboard reached.

## S-8 — R-1 regression: mid-session branch switch

The regression QA rated most likely to bite. As `admin_a`, used the branch switcher:
All Branches → Downtown Branch.

```
{ branchId: 2, branchName: "Downtown Branch",
  permissionsLoaded: true, permCount: 48, spinnerStuck: false }
```

**PASS.** `permissionsLoaded` stays `true` through the switch — no permanent
`RequirePermission` spinner. Combined with the compile-time enforcement QA verified
(omitting the field is `TS2345`), R-1 is closed both structurally and observably.

## S-9 — Staff role, landscape (1024×768) · staff_a

`staff_a` also receives the picker. Detector armed, branch tapped:

```
{ loginFormFlashes: 0, path: "/clinic/dashboard", name: "Staff A",
  role: "staff", branchName: "Main Branch",
  permCount: 31, permissionsLoaded: true, hasSidebar: true }
```

**PASS.** Zero flashes at landscape too.

On the permission count: staff resolves 31 codes against the doctor's 20. That is **not**
an escalation and there is no "staff ⊂ doctor" hierarchy to violate — `clinic_staff` and
`doctor` hold **partially disjoint** sets per `permission-matrix.md`. Staff carries
billing mutation/POS, `reports.revenue.view` and `vaccination.create`; doctor carries
`emr.create`/`emr.edit` and prescriptions. The matrix's own worked examples are
`doctor → billing = 403` and `staff → emr.edit = 403`. Role scoping is intact in both
directions; nobody should later "fix" a correct seed on the false premise that staff must
hold fewer codes than a doctor.

---

## Console / network hygiene

Three `403 (Forbidden)` console entries appeared once during the session. They are
**not reproducible on a clean load** — a fresh `/clinic/dashboard` load produces zero
4xx resource entries (`performance.getEntriesByType('resource')` filtered on
`responseStatus >= 400` returns `[]`), and the console entries do not recur. They are
attributable to this test procedure. Note the precise mechanism, since the obvious
explanation is wrong: a **tokenless** request returns **401** from `authMiddleware`, not
403. A 403 comes from `requirePlane` / `requirePermission` — a request that *did* carry a
token whose plane or permission didn't match. That points at the S-6 setup, where a
hand-fabricated session blob was injected into `sessionStorage`, rather than at the
`sessionStorage.clear()` races. Either way the conclusion holds: a spurious **deny** can
never be a privilege escalation, it is not reproducible on a clean load, and this change
touches no route and no permission. If 403s ever recur in a run that neither cleared
storage nor injected a blob, investigate at that point.

The `Viewport height is too small: 0` entry is a harness artefact of the non-compositing
browser pane.

---

## Coverage against the plan

| Case | AC / finding | Result |
|---|---|---|
| S-1 no login flash | AC-1 | PASS |
| S-2 one `/auth/me` | AC-2 | PASS |
| S-3 session + flag before dashboard | AC-3, AC-11 | PASS |
| S-4 network drop mid-select | AC-9, AC-12, F-2 | PASS |
| S-5 retry after failure | G1 | PASS |
| S-6 pre-fix blob on reload | F-1 | PASS |
| S-7 admin bypass | AC-4 | PASS |
| S-8 mid-session branch switch | R-1 | PASS |
| S-9 staff role, landscape | AC-1 (768 + 1024) | PASS |

Not exercised live: AC-5 (picker's "back to login" button — untouched by this change,
covered by the existing unit suite), AC-6/AC-7 (`select-branch` POST rejection and
server authority — covered by unit tests and by the backend integration suite),
AC-13 (`/auth/me` 200 with `permissions: []` — no seeded zero-permission user exists;
covered by unit test `useAuth.test.ts:292`).
