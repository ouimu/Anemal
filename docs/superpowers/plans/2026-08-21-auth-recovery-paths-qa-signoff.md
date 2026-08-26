# QA Sign-off — Auth Recovery Paths (ADR-0026)

**Branch:** `fix/auth-recovery-paths`
**Merge-base:** `b0fae19`  ·  **HEAD:** `d5631b3`
**Date:** 2026-08-26
**Reviewer:** @qa-agent (Standard Pipeline Step 7)
**Implements:** ADR-0026 · AUTH-BL-1/2/3 · QA carry-forwards F-5, N-1

## Verdict

# ❌ BLOCK

Two blocking findings. Neither is a defect in the shipped behaviour — the
production change is, as far as I can verify it, **correct**. Both blockers are
about *proof*: one mandatory gate has not been run, and the ADR's own central
acceptance criteria are not falsifiable against the code that actually ships.

Per ADR-0026's testing constraint — *"Non-falsifiable criteria are treated as
absent"* — and C-11, I cannot sign off while 5 of 18 AC are unproven against
`App.tsx`.

---

## 1. Baseline (re-run from scratch, not taken on trust)

| Check | Command | Result |
|---|---|---|
| Frontend suite | `npx vitest run` | **379 passed / 59 files**, 0 failed, 24.52s |
| Typecheck | `npx tsc --noEmit` | **clean**, exit 0 |
| Lint | `npx eslint src --ext .ts,.tsx` | **0 errors**, 2 warnings (both pre-existing, in files this branch does not touch: `AuthedPetImage.tsx`, `ClinicBilling.tsx`) |
| Backend untouched | `git diff b0fae19 HEAD -- src/backend` | **empty** |
| Backend suite (red-suite ship gate) | `npm test` in `src/backend` | **1295 passed / 91 suites**, 0 failed, 136s — **green**, so CLAUDE.md's red-suite ship gate does not block Step 8 |
| Scope | `git diff --name-only b0fae19 HEAD -- src/` | 19 files: **9 production, 10 test**. 0 new production files. `SettingsLayout.tsx` untouched ✅ (B-2 correctly deferred) |

---

## 2. Structural verification

### 2.1 No route guard was weakened, removed, or relaxed — mechanically proven

Extracting every `<Route …>` declaration from both revisions and diffing them:

```
$ git show b0fae19:src/frontend/src/App.tsx | grep -oE '<Route path="[^"]*"[^>]*' | sort > base
$ git show HEAD:src/frontend/src/App.tsx    | grep -oE '<Route path="[^"]*"[^>]*' | sort > head
$ diff base head
3d2
< <Route path="/403" element={<ForbiddenView/
21a21,23
> <Route path="403" element={<ForbiddenView/
> <Route path="403" element={<ForbiddenView/
> <Route path="403" element={<ForbiddenView/
```

The **only** route-level change is `−1` absolute `/403`, `+3` child `403`. Every
other route declaration is byte-identical. The multiset of
`RequirePermission perm="…"` declarations is **identical** between revisions.

> The apparent `RequirePermission` line-count delta (base 29 → head 28) is a
> deleted **comment** at base line 179 (`{/* Access denied stub — target of
> RequirePermission on deny */}`), not a guard.

**Brief item 5: PASS.** No guard was removed in exchange for a hidden nav entry.

### 2.2 Nav ↔ route permission parity — 17/17 exact

Every nav entry's `perm` matches the permission its target route is guarded on,
and **no entry lacks a `perm` key**:

| Layout | Entries | With `perm` | Mismatches |
|---|---|---|---|
| `ClinicLayout` | 8 | 8 | 0 |
| `AdminLayout` | 9 | 9 | 0 |

The menu therefore hides exactly what the route denies — no over-hiding, no
under-hiding. **ADR-0026 decision 3: PASS.**

### 2.3 The 403 component renders no layout

`App.tsx:74-85` `ForbiddenView` is a bare `div` + `useT()`. No
`ClinicLayout`/`AdminLayout`/`SettingsLayout`, no sidebar chrome, no `Navigate`.
It is the only 403 component in the codebase. **ADR-0026's named hazard is
structurally absent.**

---

## 3. Loop freedom — verified against the REAL `App.tsx`

`App.routing.test.tsx` exercises a hand-written *mirror* of the route tree, not
`App.tsx`. I built a harness that renders the real `App` and ran every path in
and out of a 403 for every role.

**Result: 22/22 pass, 2.04s, no OOM.**

| Scenario | Outcome |
|---|---|
| `/clinic` denial → in-shell `/clinic/403` + ClinicLayout chrome | ✅ terminal |
| `/clinic-admin` denial → in-shell `/clinic-admin/403` + AdminLayout chrome | ✅ terminal |
| **`/settings` denial → in-shell `/settings/403`** (tree omitted entirely by `App.routing.test.tsx`) | ✅ terminal |
| `/settings/storage/connecting` (2-deep) → `/settings/403`, not `…/connecting/403` | ✅ |
| `/clinic/vaccinations-due/record` (2-deep) → `/clinic/403` | ✅ |
| Zero-permission **doctor** at `/clinic/dashboard` | ✅ 403, nav empty, logout reachable |
| Zero-permission **admin** at `/clinic-admin/dashboard` | ✅ 403, nav empty, logout reachable |
| **Admin denied inside `/clinic/*`** → relocated by `ClinicLayout:31` | ✅ **terminates** at `/clinic-admin/403` |
| Admin landing directly on `/clinic/403` | ✅ terminates |
| Admin *with* `clinic.profile.view` on `/clinic/403` | ✅ settles on allowed dashboard, no cycle |
| Non-admin on `/clinic-admin/403` → relocated by `AdminLayout:36` | ✅ terminates on `/clinic/403` |
| **Stale bookmark to the deleted absolute `/403`** (doctor) | ✅ catch-all → `/login` → bounce → in-shell `/clinic/403` |
| Stale bookmark to `/403` (admin) | ✅ terminates in-shell |
| `/preferences` for a zero-permission session | ✅ reachable, terminal, no `RequirePermission` |
| Legacy `/admin/audit` redirect | ✅ terminates |
| Legacy `/admin/branches` → crosses into `/settings` | ✅ terminates |
| Unmatched garbage URL, authenticated | ✅ terminates |
| **Plane isolation:** platform session → `/clinic/403` | ✅ ejected to own plane, never the clinic 403 |
| `permissionsLoaded: false` → spinner, never a 403 | ✅ INV-PERM-1 holds |
| **Edge:** case-variant `/CLINIC/billing` (router matches case-insensitively) | ✅ resolves in-shell, no cycle |
| **Edge:** trailing slash `/clinic/billing/` | ✅ derives `clinic` correctly |

**Brief items 1 and 2: PASS on shipped behaviour.**

---

## 4. Mutation battery (C-11 falsifiability)

Every mutation was applied to a pristine tree, the targeted suite run, then the
file restored via `git checkout --`. Working tree verified clean after each.

### 4.1 Falsifiable — 16/16 ✅

| # | Mutation | Result |
|---|---|---|
| M1 | `RequirePermission` derivation → absolute `/403` | RED — 5 failed |
| M2 | derivation → relative `<Navigate to="403">` (the approach it replaced) | RED — 5 failed |
| M3 | derivation → `startsWith` prefix map (**the rejected design**) | RED — `/clinic-admin/403` case fails, exactly as designed |
| M11 | `permissionsLoaded` spinner gate removed | RED |
| M4 | **F-2** guard removed (malformed 200 → `[]` + `loaded:true`) | RED |
| M5 | authStore 401 loses `?reason=session-expired` | RED |
| M12 | `refreshPermissions` no-token exit → `{ok:true}` | RED |
| M14 | `normalise()` always claims `permissionsLoaded: true` | RED — 2 failed |
| M6 | `api.ts` 401 loses `?reason=session-expired` | RED |
| M7 | RoleList false-success restored | RED — 2 failed |
| M8 | RoleList warning auto-dismisses at 4s again | RED |
| M9 | `ClinicLayout` Dashboard → `perm: undefined` | RED |
| M10 | `AdminLayout` permission filter removed | RED |
| M20 | LoginView `?reason=` allow-list bypassed (raw param interpolated) | RED |
| F-5 probe | inject a `setAuth` persist before `fetchMe` | RED — **confirms `vi.doUnmock` really loads the real store**; the previously-vacuous AC-12 assertion is now load-bearing |
| M15 | delete `/settings` 403 child route (*against my harness*) | RED — 3 failed |

### 4.2 NOT falsifiable — 8 ❌

**Against the delivered suite (379/379 stays GREEN):**

| # | Mutation | Suite |
|---|---|---|
| M15 | delete the `/settings` 403 child route | 379 passed |
| M16 | delete the `/clinic-admin` 403 child route | 379 passed |
| M17 | **`ForbiddenView` renders `ClinicLayout`** — ADR-0026's named unbounded-loop hazard | 379 passed |
| M18 | `/clinic/403`'s element → literal infinite redirect to the denied dashboard | 379 passed |
| M19 | **strip `RequirePermission` from `/clinic-admin/users`** | 379 passed |
| M21 | **strip `RequirePermission` from `/settings/storage`** | 379 passed |
| M22 | remove `ClinicLayout:31`'s admin redirect | 379 passed |
| M13 | network-throw exit fabricates `{permissions: [], permissionsLoaded: true}` | 16 passed |

M17 run **against my harness** does not fail cleanly — it **hangs** (killed at
150s), which is precisely the ~4GB-heap failure the implementation notes
describe. Detection-by-hang is not an acceptable CI outcome; the durable test
needs a bounded assertion.

---

## 4.3 Independent code-review pass

Paired with the Cavecrew `reviewer` agent on the same diff (per the Step 7
instruction), briefed on the five highest-risk areas: redirect cycles, premature
`permissionsLoaded: true`, removed guards, `split('/')[1]` edge cases, and
async/error handling in `refreshPermissions` / `RoleList.handleSave`.

**Result: no issues found.** It corroborates §2 and §3 on the shipped code
(validation precedes mutation at `authStore.ts:188`; guards were *added*, not
removed; error paths all return `{ok:false}`).

It is corroboration, not independent confirmation: it reasoned about cycles
rather than executing them, and it did not assess falsifiability — it surfaced
none of F-2, F-3, or F-4, all of which are gaps in *proof* rather than in code.
No `/code-review` finding is open, so that half of the Step 7 gate is satisfied;
the blockers below are mine.

---

## 5. Findings

### 🔴 F-1 — BLOCKER (process gate) · Protocol 5 has not been run

`.claude/roadmap/qa-protocols.md` Protocol 5:

> Any release-bound branch that touches frontend code or auth code (login, JWT
> handling, RBAC guards, route protection) MUST run the
> `anemal-smoke-walkthrough` skill before it can proceed past Step 7. …
> **A branch cannot reach Step 8 without one attached.**

This branch trips **all four** triggers. No smoke artifact exists for it.
Precedent: the previous auth branch produced
`docs/superpowers/plans/2026-08-19-branch-select-login-flash-smoke.md`.

This gate is mine and it is explicitly non-deferrable (ADR-0005 D5). It cannot
be satisfied from a test runner — it needs the app running with a seeded DB and
a real browser, including one write-path exercise per plane.

**Required:** run `anemal-smoke-walkthrough`, attach the role × page table, re-request sign-off.

### 🔴 F-2 — BLOCKER (falsifiability) · `App.tsx` has zero test coverage; 5 of 18 AC are unproven

`main.tsx` is the **only** file in the repo that imports `App`. `App.routing.test.tsx`
hand-writes a parallel route tree; §4.2 shows it cannot detect *any* change to the
real one — including deleting a 403 route, reintroducing the ADR's named loop
hazard, or **stripping `RequirePermission` from two protected routes**.

The last of these is ADR-0026's own stated risk:

> A future engineer seeing a nav entry already hidden behind `hasPermission` may
> conclude the route's `RequirePermission` is redundant. Removing it would leave
> the capability fully reachable by direct URL, with the UI's silence mistaken
> for a guard. Decision 4 exists to forbid exactly this.

Decision 4 currently has **no automated enforcement**.

**AC affected (unproven against shipped code):** AUTH-403-01, -02, -03, -06, -07 — all five assigned solely to `App.routing.test.tsx`.

**On the recorded deviation.** The stated justification — that rendering the real
`App` "reliably exhausted the Vitest worker's heap (measured: >4GB, worker
crash)" — **does not hold**. The file's own hypothesis names the cause
correctly (react-query/idle-logout/preference-hydration loops); mocking those
four modules makes the real `App` render in **2.04 seconds**. I have a working
22-test harness proving it.

**Required (either):**
1. Promote the harness (see §7) so the real `App.tsx` is under test; **and**
2. Add a route-manifest parity test asserting every route in the RBAC route map
   is wrapped in `RequirePermission` with the expected code. My harness catches
   M19 but **not** M21 — per-scenario tests will always leave gaps that a
   table-driven manifest test closes. `anemal-rbac-matrix` already defines the map.

### 🟠 F-3 — MEDIUM · AUTH-REFRESH-03's `RoleList` half is unimplemented and untested

AC: *"`fetch` throw inside refresh is caught, not an unhandled rejection, **same
warning as 01**"* — test locations `authStore.test.ts` **+ `RoleList.test.tsx`**.

The authStore half is implemented and falsifiable. The `RoleList` half is neither.
`handleSave`'s `onSuccess` (RoleList.tsx:180-193) does `await refreshPerms()`
with no `try`/`catch`. **Verified by probe:** when `refreshPermissions` rejects,
RoleList shows **no toast at all** — neither the warning nor the success — and the
rejection escapes the async `onSuccess`. No test at the location the AC names.

Mitigating: `refreshPermissions`' contract is total today, so this is
defence-in-depth. But the failure mode — user saves, sees nothing, assumes it
worked — is adjacent to the "false success" this ADR exists to remove.

**Fix:** wrap the `await` in `try`/`catch` and show the same warning; add the case to `RoleList.test.tsx`.

### 🟡 F-4 — LOW · The network-throw exit does not assert INV-PERM-1

`authStore.test.ts` case 2 asserts only the return value. Injecting
`set({ permissions: [], permissionsLoaded: true })` into the `catch`
(authStore.ts:159-163) leaves the suite **GREEN** (M13). The other two failure
exits (500, malformed body) *do* assert unchanged-ness.

**Fix:** add the same two `before.*` assertions cases 4 and 6 already use.

### 🟡 F-5 — LOW · `refreshPermissions` claims platform support but ejects to the clinic plane

`authStore.ts:153` branches on `plane === 'platform'` → `/platform/auth/me`, but
`:167`'s 401 hardcodes `/login?reason=session-expired` — the **clinic** login.
Contradicts ADR-0026 decision 7 ("routes to the session's own plane").

**Not reachable today** — nothing in production sets `useAuthStore.plane = 'platform'`;
platform sessions use `usePlatformAuthStore` + `platformApi`, whose 401 correctly
goes to `/platform/login`. So plane isolation itself is **intact** (brief item 7:
PASS). But the file simultaneously claims and violates plane-correctness.

**Fix:** delete the dead branch, or make the redirect plane-aware.

### 🟡 F-6 — LOW · Layouts read `hasPermission` without gating on `permissionsLoaded`

Verified: while permissions are **unknown**, both sidebars render **empty** while
the content area correctly shows the spinner. Nav is cosmetic and never
enforcement, so there is no security impact — but this is the same "unknown
rendered as none" shape decision 5 forbids in the store, and `AdminLayout`
newly acquires it (it previously had no filter at all).

### ⚪ F-7 — COSMETIC · `RoleList` comment overclaims

RoleList.tsx:396-399 says the warning "must not be dismissible without it
[reload]", but the dismiss ✕ (411-419) renders for **all** toast types including
warning. Drop the claim or hide ✕ for warnings.

### ⚪ F-8 — COSMETIC · Stale docblock

`RequirePermission.tsx:4` and `:33` still say "Redirects to `/403`". That route
no longer exists.

---

## 6. AC coverage map

| AC | Requirement | Verdict |
|---|---|---|
| AUTH-403-01 | In-shell denial, held nav items work | ⚠️ **behaviour PASS** (§3) · **proof gap F-2** |
| AUTH-403-02 | Zero-permission: no denying items, logout present | ⚠️ behaviour PASS · proof gap F-2 |
| AUTH-403-03 | ≥1 non-logout affordance; chain ≤3 navigations | ⚠️ behaviour PASS · proof gap F-2 |
| AUTH-403-05 | Nav honesty | ✅ PASS — falsifiable (M9, M10) + 17/17 parity |
| AUTH-403-06 | 403 route never redirects | ⚠️ behaviour PASS · proof gap F-2 |
| AUTH-403-07 | `/preferences` reachable from 403 | ⚠️ behaviour PASS · proof gap F-2 |
| AUTH-REFRESH-01 | Refresh non-ok → warning, not success | ✅ PASS — falsifiable (M7) |
| AUTH-REFRESH-02 | Refresh ok → success toast | ✅ PASS |
| AUTH-REFRESH-03 | Throw caught, same warning as 01 | ❌ **FAIL — F-3** (authStore half passes; RoleList half absent) |
| AUTH-REFRESH-04 | Malformed body ≠ authoritative empty | ✅ PASS — falsifiable (M4) |
| AUTH-REFRESH-05 | Warning persists + reload control | ✅ PASS — falsifiable (M8) |
| AUTH-REFRESH-06 | Total over all 5 exits | ⚠️ PASS with gap — 4/5 exits assert the invariant; network-throw does not (F-4) |
| AUTH-INV-PERM-01 | Failed refresh leaves state untouched | ⚠️ PASS with gap (F-4) |
| AUTH-401-01 | authStore 401 → `?reason=session-expired` | ✅ PASS — falsifiable (M5) |
| AUTH-401-02 | `api.ts` 401 → same | ✅ PASS — falsifiable (M6) |
| AUTH-401-04 | Unknown `?reason=` → no banner, never in DOM | ✅ PASS — falsifiable (M20) |
| AC-12 (F-5) | Failed login leaves no persisted blob | ✅ PASS — vacuity genuinely removed, confirmed by probe |
| N-1 | Malformed JSON → `IdentityLoadError` | ✅ PASS |

**Tally: 10 clean pass · 5 behaviour-pass-but-unproven · 2 pass-with-gap · 1 fail.**

### Other checks

| Check | Result |
|---|---|
| i18n parity | ✅ 6/6 new keys present in **both** `en` and `th` |
| Vacuous-test scan | ✅ no `.only`, `.skip`, `expect(true)`, or `afterEach: undefined` in any changed test file |
| Group 7 (uiux) sizing | ✅ `min-h-[60vh] … px-md` is correct inside `main` (`min-h-screen overflow-y-auto pt-16`); `h-screen` would have overflowed |
| Tenant isolation | N/A — frontend-only, no query/endpoint touched |

---

## 7. Handover artifact

`src/frontend/src/__qa_tmp__/qa.real-app-routing.verify.test.tsx` — **untracked, not committed.**

22 tests, renders the real `App.tsx`, 2.04s. With it present the suite reads
**401 passed / 60 files** (379 + 22); the branch's own delivered figure remains
379 / 59. This is the working proof that F-2's recorded deviation is unnecessary. It is **not** a QA deliverable to merge as-is:
`@dev-agent` should relocate it (`src/frontend/src/__tests__/`), and
`@ponytail-agent` should scope-check it, since it adds a test file the approved
plan did not enumerate. It also needs a **bounded** loop guard so M17 fails fast
instead of hanging.

---

## 8. Approval

- [ ] ✅ Approved for Staging
- [ ] ✅ Approved for Production
- [x] ❌ **BLOCKED** — F-1 and F-2 must clear before Step 8

**QA-Agent Approval: ❌ WITHHELD**

**Path to green:**
1. Run `anemal-smoke-walkthrough`; attach the role × page table (**F-1**).
2. Put `App.tsx` under test + add the route-manifest parity test (**F-2**).
3. Fix `RoleList.handleSave`'s missing `catch` + add the AC's named test (**F-3**).
4. Optional but cheap: F-4, F-5, F-6, F-7, F-8.
5. Re-run `/code-review`, then re-request sign-off.

I re-verify from scratch on resubmission — no finding is carried as closed on assertion.
