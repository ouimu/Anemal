# QA Sign-off — Auth Recovery Paths (ADR-0026)

**Branch:** `fix/auth-recovery-paths`
**Merge-base:** `b0fae19`  ·  **HEAD:** `b3b7f04` (+ one uncommitted QA change, §7)
**Date:** 2026-08-26
**Reviewer:** @qa-agent (Standard Pipeline Step 7)
**Implements:** ADR-0026 · AUTH-BL-1/2/3 · QA carry-forwards F-5, N-1

**Round 1 verdict:** BLOCK (F-1, F-2).
**Round 2 verdict:** ↓

# QA-Agent Approval: ✅

Re-reviewed from scratch. Every round-1 finding was re-tested by mutation
against the new code; none was accepted on report. Both blockers are genuinely
closed, and each fix is falsifiable.

---

## 1. Baseline (re-run from scratch)

| Check | Result |
|---|---|
| Frontend suite | **405 passed / 60 files**, 0 failed |
| `npx tsc --noEmit` | clean, exit 0 |
| `npx eslint src` | **0 errors**, 2 warnings (pre-existing, untouched files) |
| Backend | untouched; suite **1295 passed / 91 suites** (round 1) — red-suite ship gate clear |

> Count reconciliation: coordinator reported 408/61. This review deletes the
> superseded `App.routing.test.tsx` (−6 tests, −1 file) and ports 3 of its cases
> forward (+3): 408 − 6 + 3 = **405 / 60**. See §5.

The accidentally-committed `__qa_tmp__` harness is confirmed absent from the
HEAD tree (added `16d0a4d`, removed `64db16b`) — verified, not assumed.

---

## 2. F-1 — Protocol 5 browser smoke · **CLOSED**

`docs/superpowers/plans/2026-08-21-auth-recovery-paths-smoke.md`. Real backend
`:4000` + frontend `:5173` + seeded Postgres, as `doctor_a` (20 permissions,
deliberately lacking `billing.create` / `grooming.view` /
`clinic.integrations.edit`). All pass.

Substantive, not ceremonial. Three results carry independent weight:

- **`scrollOverflow: 0`** on the in-shell 403 — confirms the Group 7
  `h-screen` → `min-h-[60vh]` fix against a real layout engine, which no jsdom
  test can do.
- **`/settings/storage/connecting` → `/settings/403`** — the two-segment case
  decided against the real router, in the third tree.
- **Stale `/403` → `/clinic/dashboard`, session intact** — validates Ponytail's
  C-2 reversal live.

The console `403` on `/api/reports/snapshot` is correctly triaged: pre-existing,
the server enforcing its own guard, unrelated to this branch. Logged for backlog.

### Two deviations from the skill, accepted — recorded, not waived

1. **No write-path case (skill step 5).** Step 5 exists to catch regressions
   that "only surface on submit". This branch's only write-path change is
   `RoleList.handleSave`'s post-save toast; it is now covered by four
   mutation-verified tests (AUTH-REFRESH-01/02/03/05) including the rejection
   path, and nothing in the diff touches validation or submit handling.
2. **Only `doctor_a` walked** — not `clinic_admin`, whose `AdminLayout` gained a
   permission filter it previously lacked *entirely* (the branch's largest nav
   behaviour change). Mitigated by: `AdminLayout.test.tsx` (mutation-verified),
   four admin cases in `App.realRouting.test.tsx`, and the mechanical 17/17
   nav↔route permission parity in §4.3 — a wrong permission code would have to
   be identically wrong in both the nav array and the route guard.

Neither is worth a second block. **Recommend** a `clinic_admin` pass at Step 8
if cheap; it is the one surface with no live coverage.

---

## 3. F-2 — App.tsx coverage · **CLOSED**

Two new files, both verified falsifiable by me:

- `src/frontend/src/__tests__/App.realRouting.test.tsx` — renders the **real**
  route tree. My round-1 finding that the "~4GB OOM" was a mock defect is
  confirmed and correctly attributed in the header (a `MockAuth` missing
  `plane`, so `RequirePlane` redirected forever).
- `src/frontend/src/__tests__/App.routeManifest.test.ts` — source-level guard
  manifest via Vite `?raw`.

Three design choices are right, and worth recording because each closes a
specific hole:

- **Ordered list, not a keyed map** — `dashboard` appears in two trees with
  different permissions; a path-keyed map silently collides them.
- **A self-falsifiability test** (line 89) — if the extractor regex ever stops
  matching, every other assertion would pass vacuously against an empty list.
  This is the one guard I would otherwise have had to ask for.
- **`?raw` over `node:fs`** — the self-caught `tsc --noEmit` break. Verified clean.

**LoopGuard verified independently.** The `ClinicLayout` mutation now fails in
**17 tests at 8–65 ms each** instead of hanging the runner for 150 s+. Correctly
placed inside the router but outside `<Routes>`, so its ref accumulates across
navigations.

---

## 4. Mutation battery — re-run in full against the new code

Every mutation applied to a pristine tree, targeted suite run, file restored via
`git checkout --`. Working tree verified clean after each.

### 4.1 Round-1 blockers — all now falsifiable

| # | Mutation | Round 1 | Round 2 |
|---|---|---|---|
| M15 | delete `/settings` 403 child route | 379 GREEN ❌ | **RED** — 4 failed |
| M16 | delete `/clinic-admin` 403 child route | 379 GREEN ❌ | **RED** — 7 failed |
| M23 | delete `/clinic` 403 child route | *(not run)* | **RED** — 9 failed |
| M17 | `ForbiddenView` renders `ClinicLayout` (ADR's named loop hazard) | GREEN ❌ / **hung** my harness | **RED — 17 failed, fails fast** |
| M18 | `/clinic/403` → literal infinite redirect | GREEN ❌ | **RED** — 8 failed |
| M19 | strip `RequirePermission` from `/clinic-admin/users` | GREEN ❌ | **RED** — 4 failed (manifest **and** rendering) |
| M21 | strip `RequirePermission` from `/settings/storage` | GREEN ❌ | **RED** — 3 failed (manifest; rendering still misses it, as predicted) |
| M22 | remove `ClinicLayout:31` admin redirect | GREEN ❌ | **RED** — 3 failed |
| M13 | network-throw exit fabricates `[]` + `loaded:true` (F-4) | GREEN ❌ | **RED** — AUTH-INV-PERM-01 |

### 4.2 New mutations this round

| # | Mutation | Result |
|---|---|---|
| M24 | guard **weakened** not removed (`billing.create` → `billing.view`) | **RED** — manifest catches perm-code changes, not just deletions |
| N1 | F-3 `try`/`catch` removed (unguarded await) | **RED** — AUTH-REFRESH-03 |
| **M25** | **a NEW route added with NO guard at all** | **GREEN** ⚠️ — see F-9 |

### 4.3 Re-confirmed from round 1

Nav↔route permission parity re-checked mechanically: **17/17 exact, 0 entries
without a `perm`**. Segment derivation, F-2 malformed-body, both 401 `?reason=`
sites, RoleList branching and persistence, both nav fixes, the `?reason=`
allow-list — all still falsifiable.

---

## 5. Ruling on the open question: delete `App.routing.test.tsx`?

**Ruling: delete it — but only after porting, which I have done.**

The drift concern is not hypothetical; it had *already* happened, one commit
after the file was written:

- Its inline `ForbiddenView` still carried **`h-screen`** — the exact styling
  Group 7 replaced with `min-h-[60vh] … px-md` — while its docstring claimed
  *"Mirrors App.tsx's inline ForbiddenView"*. That claim was false.
- It declared **no `/settings` tree at all** (11 distinct paths vs App.tsx's 53).

So it was a hand-maintained mirror already misrepresenting the thing it mirrored
— precisely the hazard Ponytail cited when rejecting the tree-prefix map.

**But it was not pure duplication.** It held two AC-load-bearing cases
`App.realRouting.test.tsx` did not have — that file contains no `fireEvent` at
all, so nothing in it clicked anything:

- **AUTH-403-01's second half** — "a denied doctor still sees a nav item they
  *do* hold". The real-routing `/clinic denial` case asserted chrome and
  sign-out, but never that a held nav link renders.
- **AUTH-403-03 / -07's click-through** — that an affordance *on the 403 render*
  actually reaches a rendering route. Navigating directly to `/preferences`
  proves the route works; it does **not** prove the denial is escapable, which
  is what the AC claims.

Deleting the file as-is would have silently dropped both. I ported three cases
into `App.realRouting.test.tsx` and deleted the mirror. The ported versions are
**stronger** than the originals: the held-nav-item case now clicks a **real**
`NavLink` rendered by the real `ClinicLayout`, where the mirror clicked a stub.

All three verified falsifiable:

| Probe | Result |
|---|---|
| sidebar renders no held nav item (`NAV.filter(() => false)`) | **RED** — 2 failed |
| `TopNav` (the affordance carrier) removed from `ClinicLayout` | **RED** — 4 failed |

**Note for whoever writes these next:** on a *transition* into a `lazy()` route,
React `<Suspense>` **hides** the previous subtree with `display: none !important`
rather than unmounting it — so `queryByText(...)` still finds the old 403 node
and `toBeNull()` fails. Assert `.not.toBeVisible()` instead. That is also the
more honest claim: the denial is no longer *shown*. This bit me while porting;
it does not affect the pre-existing tests, which navigate on initial mount where
there is no prior content to hide.

---

## 6. Findings

### 🟡 F-9 — LOW (new, residual) · A newly-added *unguarded* route is still invisible

`M25`: adding `<Route path="secrets" element={<AdminAudit/>}/>` under
`/clinic-admin` with no guard leaves the whole suite **GREEN**.

The manifest is an allow-list of *guarded* routes — a route with no
`RequirePermission` produces nothing to extract, and the rendering tests only
visit routes they name. So the *removal* direction is now locked (F-2 closed),
but the *addition* direction is not.

Materially weaker than the round-1 blocker: it requires someone to author a new
protected route and omit the guard, rather than delete a guard from an existing
one because the nav is hidden — the specific reasoning ADR-0026 decision 4
forbids, which is now enforced.

**Not a blocker.** Fix when convenient: extract *every* `<Route path=…>` inside
the three clinic trees and assert each is either in `EXPECTED_GUARDS` or in a
short explicit unguarded allow-list (`403`, `index`, the `Navigate` redirects).

### Round-1 findings — disposition

| # | Finding | Status |
|---|---|---|
| F-1 | Protocol 5 not run | ✅ **CLOSED** (§2, two deviations recorded) |
| F-2 | App.tsx uncovered, 5 AC non-falsifiable | ✅ **CLOSED** (§3, §4.1) |
| F-3 | AUTH-REFRESH-03 RoleList half absent | ✅ **CLOSED** — `try`/`catch` added, AUTH-REFRESH-03 test added, **N1 RED** |
| F-4 | Network-throw exit unasserted | ✅ **CLOSED** — **M13 RED** |
| F-5 | Dead platform branch claiming plane-correctness | ✅ **CLOSED** — branch deleted (not "fixed"), docblock updated. Right call: a guard for an unreachable state gives false confidence |
| F-6 | Layouts render "unknown permissions" as empty nav | ⬜ Open, cosmetic — declined, agreed |
| F-7 | Toast comment overclaimed | ✅ **CLOSED** — comment corrected. **I agree with the ruling:** ADR-0026 decision 6 forbids *auto*-dismissal (silent erasure of evidence the user may not have read). A deliberate ✕ is a user action, and a warning with no exit would be hostile. The code was right; the comment was wrong |
| F-8 | Stale `/403` docblock in `RequirePermission.tsx` | ⬜ Open, cosmetic — declined, agreed (`:4` and `:33` still say "Redirects to /403"). The `authStore` docblock *was* corrected |
| F-9 | New unguarded route invisible | ⬜ **New**, LOW — above |

---

## 7. AC coverage map — final

| AC | Verdict |
|---|---|
| AUTH-403-01 | ✅ PASS — now falsifiable (M23/M17 + ported held-nav-item case) |
| AUTH-403-02 | ✅ PASS — M15/M16/M23 RED |
| AUTH-403-03 | ✅ PASS — ported click-through, falsifiable |
| AUTH-403-05 | ✅ PASS — M9/M10 + 17/17 parity |
| AUTH-403-06 | ✅ PASS — M18 RED |
| AUTH-403-07 | ✅ PASS — ported affordance case, falsifiable |
| AUTH-REFRESH-01 | ✅ PASS — M7 RED |
| AUTH-REFRESH-02 | ✅ PASS |
| AUTH-REFRESH-03 | ✅ PASS — **was FAIL in round 1**; N1 RED |
| AUTH-REFRESH-04 | ✅ PASS — M4 RED |
| AUTH-REFRESH-05 | ✅ PASS — M8 RED |
| AUTH-REFRESH-06 | ✅ PASS — all 5 exits now assert the invariant |
| AUTH-INV-PERM-01 | ✅ PASS — M13 RED |
| AUTH-401-01 / -02 / -04 | ✅ PASS — M5 / M6 / M20 RED |
| AC-12 (F-5 carry-forward) | ✅ PASS — vacuity genuinely removed |
| N-1 | ✅ PASS |

**18/18 pass. 0 unproven. 0 fail.**

---

## 8. Uncommitted QA change — needs committing before Step 8

The working tree carries my §5 ruling, deliberately left uncommitted:

```
 D src/frontend/src/App.routing.test.tsx
 M src/frontend/src/__tests__/App.realRouting.test.tsx   (+58/−3)
```

Suite **405/60**, `tsc` clean, eslint 0 errors with it applied. Commit it (or
revert it and keep the mirror — but then §5's drift stands unaddressed).

Per the deleted-coverage rule: this deletes 6 tests and replaces them with 3 that
cover the same ACs against the real `App`. Justification is §5.

---

## 9. Approval

- [x] ✅ Approved for Staging
- [x] ✅ Approved for Production

**QA-Agent Approval: ✅**

Cleared for Step 8 (`/anemal-finish-branch`), with three carry-forwards for the
PR body: commit the §8 change; attach the smoke table; F-6 / F-8 / F-9 to backlog.
