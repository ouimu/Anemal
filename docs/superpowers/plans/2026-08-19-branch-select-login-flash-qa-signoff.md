# QA Sign-off — Branch-Select Login Flash / Delayed Dashboard Redirect

**Branch:** `fix/branch-select-login-flash`
**Pipeline step:** STEP 7 (`/code-review` + QA sign-off) — gate before STEP 8 (`/anemal-finish-branch`)
**Reviewer:** @qa-agent
**Round 1:** 2026-08-19 — ⛔ BLOCK (F-1 HIGH, F-2 MEDIUM, F-3 MEDIUM)
**Round 2:** 2026-08-20 — ✅ APPROVE, conditional on P5
**Round 3:** 2026-08-20 — ✅ **APPROVE (unconditional)** — P5 ran green
**Inputs:** plan `2026-08-19-branch-select-login-flash.md`, ADR-0024, grill record (G1/G2),
BA sign-off (AC-9..13, R-1), `.claude/roadmap/qa-protocols.md`,
P5 record [`2026-08-19-branch-select-login-flash-smoke.md`](./2026-08-19-branch-select-login-flash-smoke.md)

---

## VERDICT: ✅ APPROVE — unconditional

**QA-Agent Approval: ✅**

All three round-1 blockers are fixed and each was independently verified by
re-introducing the exact defect it closes and confirming the new test goes RED. The
round-1 guard battery still kills every one of its mutants against the new code. **P5
(`anemal-smoke-walkthrough` + plan T20) has now run green against a real backend,
frontend and seeded database — all 9 cases PASS, no findings.** The last conditional
item is discharged.

**STEP 8 (`/anemal-finish-branch`) is unblocked.**

Three low-severity items are carried forward as backlog for the next auth-touching
branch (F-5, N-1, N-2) — none affects this branch's correctness. Two documentation
observations on the smoke record itself are noted in §7; neither is a product defect.

---

## 1. Round-2 verification — real command output

### `npx vitest run` (in `src/frontend`)

```
 Test Files  8 failed | 47 passed (55)
      Tests  330 passed (330)
   Duration  34.60s
```

330 passed (327 + 3 new), 0 failed. The 8 failing **files** collect 0 tests each and
fail with `Error: [vitest] No "QueryClient" export is defined on the "@tanstack/react-query" mock`
— pre-existing, identical on clean `main`, none touched by this change. Not a blocker.

### `npx tsc --noEmit`

```
(no output)   exit 0
```

`tsconfig.json` is `"target": "ES2022"` / `"lib": ["ES2022", ...]`, so the
`new IdentityLoadError(msg, { cause })` form used by the F-2 fix is properly supported
rather than silently dropped.

### `npx eslint src --ext .ts,.tsx`

```
✖ 2 problems (0 errors, 2 warnings)   exit 0
```

Both warnings are pre-existing `react-refresh/only-export-components` in
`AuthedPetImage.tsx` and `ClinicBilling.tsx`. The two `_omit` warnings this branch had
introduced are gone. **F-6's lint half is closed.**

### Scope of change since round 1

`diff` of the two revisions shows the fix touched **exactly two functions** and nothing
else: `fetchMe()` in `useAuth.ts` (F-2) and the `permissionsLoaded` expression in
`normalise()` in `authStore.ts` (F-1), plus test files. No collateral edits.

---

## 2. Mutation testing — each fix independently proven

Protocol: re-introduce the defect, confirm RED, byte-restore, diff against backup.
Nothing taken on the dev-agent's word.

| # | Mutant | Target | Result |
|---|---|---|---|
| **M12** | **fetch moved back out of `mutationFn` into `onSuccess`, picker dismissed before identity resolution is awaited — the literal original bug** | **F-3 / AC-1** | ✅ **RED** — `expected document not to contain element, found <input id="username" ... value="alice" />` |
| **M13** | network throw no longer wrapped as `IdentityLoadError` | F-2 | ✅ RED (1 failed) |
| **M14** | `normalise()` reverted to the round-1 `typeof`-guard | F-1 | ✅ RED — *"a pre-fix blob with permissionsLoaded: false and real permissions still restores as loaded"* |
| M2 | `useSwitchBranch` → `permissionsLoaded: false` | AC-11 / R-1 | ✅ RED (1 failed) |
| M3 | duplicate `await fetchMe()` in branch-select `mutationFn` | AC-2 | ✅ RED (3 failed) |
| M4 | branch-select `fetchMe` failure swallowed → stub identity | AC-9, AC-12 | ✅ RED (5 failed) |
| M5 | branch-select `setAuth` → `permissionsLoaded: false` | AC-3 | ✅ RED (2 failed) |
| M6 | direct/admin `fetchMe` failure swallowed | AC-4, AC-10 | ✅ RED (1 failed) |
| M7 | `IdentityLoadError` → plain `Error` on non-ok | error typing | ✅ RED (3 failed) |
| M9 | direct/admin `setAuth` → `permissionsLoaded: false` | AC-4 | ✅ RED (1 failed) |
| M10 | `permissionsLoaded` omitted at the `useSwitchBranch` call site | AC-11 | ✅ RED **at compile time** (TS2345) |
| M15 | `res.json()` try/catch removed (malformed-body branch) | F-2 (3rd path) | ⚠️ survived — N-1 |
| M8 | `await` inserted *inside* `onSuccess` after dismissal | AC-1 residual | ⚠️ survived — N-2 |

**M12 is the important one.** The dev-agent's RED claim is confirmed independently, with
the same assertion text. AC-1 — the entire reported bug — now has a guard that actually
fails when the bug returns.

---

## 3. Independent end-to-end verification (QA-authored probes, run then deleted)

### F-1 — a real pre-fix session survives the upgrade

Ran the pre-fix login sequence against the pre-fix store
(`git show main:src/frontend/src/store/authStore.ts`) to produce a genuine legacy blob,
then handed that exact blob to the fixed store:

```
>>> REAL legacy blob permissionsLoaded = false
>>> AFTER UPGRADE: isAuthenticated = true | permissions = 2
                   | permissionsLoaded = true | RequirePermission renders = the route
```

Round 1 the same probe printed `INFINITE SPINNER`. **F-1 is genuinely closed.**
Independently reconfirmed live in P5 case S-6.

Negative twin — a pre-fix **half** session (identity fetch had failed, `permissions: []`)
still restores as `permissionsLoaded: false`, i.e. *unknown*, not rescued. INV-PERM-1
holds: the OR widened the rescue exactly as far as intended and no further.

### AC-12 / F-2 — real store, real `LoginView`, both failure shapes

Parameterised across a network throw and a 404 (disabled-account), driving the real
`LoginView` + real `useLogin` + real `authStore`. Both passed: `sessionStorage` null,
not authenticated, no navigate, picker mounted, credentials form absent, exactly one
fetch, and the rendered text **"Could not load your permissions. Please try again."**
Independently reconfirmed live in P5 case S-4.

---

## 4. AC coverage table (final)

| AC | Statement (abbrev.) | Unit guard | Live (P5) | Verdict |
|---|---|---|---|---|
| **AC-1** | **No credentials-form render between branch tap and dashboard** | `LoginView.branchSelectNoFlash.test.tsx` — killed by M12 | **S-1, S-9** — `loginFormSeenCount: 0` over 10.6 s @768×1024; `loginFormFlashes: 0` @1024×768 | ✅ |
| AC-2 | Exactly one `GET /auth/me` per login | `useAuth.test.ts:158`, `:259` — killed by M3 | S-2 — one `/auth/me` on the wire | ✅ |
| AC-3 | `permissionsLoaded === true` before `navigate()` | `:159-162` (`invocationCallOrder`) — killed by M5 | S-3 — `permissionsLoaded: true`, no spinner | ✅ |
| AC-4 | Direct/admin: unchanged on success, error on failure | `:252`, `:264` — killed by M6/M9 | S-7 — `branchId: null`, All Branches, 48 perms, no picker | ✅ |
| AC-5 | "Back to login" still shows the form immediately | re-run only; `resetBranchSelection` untouched | not exercised live (untouched by this change) | ✅ |
| AC-6 | `selectBranch` POST rejection leaves picker + error UI | `:188` it.each | not exercised live (unit + backend integration) | ✅ |
| AC-7 | Server 4xx remains sole authority | `:188` | not exercised live (unit + backend integration) | ✅ |
| AC-8 | `refreshPermissions()` + `RoleList.tsx` unchanged | diff review — neither file in the diff | n/a | ✅ |
| AC-9 | `/auth/me` failure: no setAuth, no persist, no navigate, picker stays, one call | `:188` ×4 — killed by M4 | S-4 — all clauses, `meCallCount: 1` | ✅ |
| AC-10 | Same guarantee on direct/admin path, clean re-submit | `:264` — killed by M6 | S-5 retry (branch path) | ✅ |
| AC-11 | `permissionsLoaded` explicit everywhere; switch-branch stays `true` | `:323` — killed by M2 **and** tsc via M10 | **S-8** — `admin_a` All Branches → Downtown, flag stayed `true`, no spinner | ✅ |
| **AC-12** | **Failed login leaves no persisted blob — F5 lands on `/login`** | `:208` vacuous (F-5) + QA probe | **S-4** — `sessionStorageAuth: null`, `localStorageAuth: null` | ✅ behaviour proven twice; permanent guard still transitive |
| AC-13 | `/auth/me` 200 + `permissions: []` → session established, denies to `/403` | `:292` — killed by M3/M5 | not exercised live (no seeded zero-permission user) | ✅ |

**13 of 13 acceptance criteria verified. 12 carry a permanent unit guard that fails on
regression; AC-12's permanent guard remains transitive (F-5).**

Also proven live beyond the AC set: **G1** (`pendingToken` reuse) — S-5 re-tapped the
same branch after a failure against the real backend and reached the dashboard,
`totalMeCalls: 2` (one per attempt). This was the grill's CRITICAL finding and had
previously only been asserted by unit test plus a backend integration test; it is now
confirmed in production code paths.

---

## 5. P5 — Browser smoke walkthrough: **PASS**

Full record: [`2026-08-19-branch-select-login-flash-smoke.md`](./2026-08-19-branch-select-login-flash-smoke.md)

Run against local Postgres (seeded) + backend `:4000` + frontend `:5173`, tenant
`dev-clinic`, at **768×1024** (tablet portrait) and **1024×768** (tablet landscape).
**All 9 cases PASS, no findings.**

| Case | Covers | Result |
|---|---|---|
| S-1 | AC-1 no login flash (`doctor_a`, 768×1024) | PASS — `loginFormSeenCount: 0` / 10.6 s |
| S-2 | AC-2 exactly one `/auth/me` | PASS |
| S-3 | AC-3, AC-11 session established correctly | PASS |
| S-4 | AC-9, AC-12, F-2 network drop mid-select | PASS |
| S-5 | G1 retry with the same `pendingToken` | PASS |
| S-6 | **F-1 pre-fix blob on reload** | PASS — dashboard renders, `spinnerOnly: false` |
| S-7 | AC-4 admin bypass | PASS |
| S-8 | **R-1 mid-session branch switch** | PASS — flag stays `true` |
| S-9 | AC-1 at landscape, staff role | PASS — `loginFormFlashes: 0` |

**On the method — I accept it as stronger than screenshots, not weaker.** Screenshots
were unavailable (browser pane not compositing), so absence-of-flash was measured with a
`MutationObserver` over the whole subtree plus a 1 ms poll for `#username`/`#password`,
armed while the picker was on screen and **before** the branch was tapped. A screenshot
cannot prove the absence of a sub-100 ms render; this instrumentation is the direct
negation of the reported symptom, and it is the right call for this particular assertion.

Both items I had specifically asked to be eyeballed came back clean: **no-flash on real
hardware** (S-1/S-9) and **the F-1 deploy-day upgrade path with a previous-build session
in an open tab** (S-6, using the exact pre-fix blob shape — `permissionsLoaded: false`
alongside a populated 20-entry `permissions` array — matching my own probe result).

---

## 6. Finding status — final

| ID | Sev | Finding | Status |
|---|---|---|---|
| **F-1** | HIGH | Legacy blob → permanent permission spinner on first reload after deploy | ✅ **FIXED & VERIFIED** — OR form; M14 RED; real-blob upgrade probe green; negative twin still `false`; confirmed live (S-6) |
| **F-2** | MED | Network drop showed "Could not select branch" / "Invalid credentials" | ✅ **FIXED & VERIFIED** — all three failure modes wrapped as `IdentityLoadError` with `cause` preserved; M13 RED; `it.each` row flipped; confirmed live (S-4) |
| **F-3** | MED | AC-1 guard vacuous | ✅ **FIXED & VERIFIED** — new real-component test; M12 RED with the literal original bug; confirmed live (S-1, S-9) |
| **F-4** | LOW | `refreshPermissions()` persists a stale flag | ✅ **Closed as documented invariant.** Out of scope (`AUTH-BL-1/2`). The F-1 OR fix also neutralises it. Record INV-REFRESH-1 (below) in ADR-0024's consequences |
| **F-5** | LOW | AC-12 assertion vacuous under the mocked store | ➡️ **Backlog** — behaviour proven twice (probe + S-4); missing only a permanent guard |
| **F-6** | LOW | Legacy-blob tests modelled the wrong shape + 2 lint warnings | ✅ **FIXED** — realistic pre-fix blob now tested; lint warnings gone |
| **N-1** | LOW | Malformed-body branch untested (M15 survived) | ➡️ **Backlog** |
| **N-2** | LOW | Residual AC-1 shape (M8 survived) | ➡️ **Backlog / won't-fix** |

### Backlog carried to the next auth-touching branch

1. **F-5** — delete the vacuous `expect(sessionStorage.getItem('vc_auth')).toBeNull()` at
   `useAuth.test.ts:208` (it cannot fail, so it misleads the next reader into thinking
   AC-12 is guarded there), **or** commit the QA probe that exercises AC-12 against the
   real store. The behaviour is correct; only the permanent guard is missing.
2. **N-1** — add one `it.each` row for the malformed-body path
   (`{ ok: true, json: () => Promise.reject(new SyntaxError()) }`). The BA's failure
   taxonomy names this case ("Malformed body / JSON parse failure → 200 → don't sign in");
   the code handles it correctly and QA verified it manually, but M15 showed no test fails
   if the `res.json()` try/catch is removed.
3. **N-2** — likely **won't-fix**. M8 (an `await` inserted *inside* `onSuccess` after the
   picker dismissal) still survives, but after ADR-0024 `onSuccess` receives an
   already-resolved `me` and has nothing to await, so producing that shape requires
   deliberately adding an await to a synchronous function. The realistic regression —
   moving identity resolution back out of `mutationFn` — is caught by M12. Recorded for
   completeness only.

### INV-REFRESH-1 (record in ADR-0024 consequences)

> Any caller of `refreshPermissions()` must already hold `permissionsLoaded === true`.
> It persists `next = { ...get(), ...patch }` *before* `set({ ...patch, permissionsLoaded:
> true })`, so calling it from a `false` state writes a blob that disagrees with memory.
> With the F-1 OR fix this is now self-healing whenever `permissions` is non-empty, but a
> new caller must not rely on that.

---

## 7. Notes on the P5 record itself (documentation only — no product defect)

Neither item changes the P5 verdict; both are recorded so a future reader is not misled
by the smoke document.

**O-1 — S-9's stated rationale is garbled.** The line *"31 permissions (correctly fewer
than the doctor's 20-vs-admin's 48 spread — role scoping intact)"* asserts an ordering
that does not exist and does not hold in its own numbers: staff's 31 is **more** than
doctor's 20, not fewer. The **conclusion is nonetheless correct** — I checked the counts
against `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md`, and
`clinic_staff` and `doctor` hold **partially disjoint**, non-hierarchical sets: staff has
ops/commerce (billing mutation/POS, `reports.revenue.view`, `vaccination.create`,
inventory) that doctor lacks, while doctor has clinical (`emr.create`/`emr.edit`,
prescriptions) that staff lacks — the matrix's own worked examples are exactly
`doctor→billing=403` and `staff→emr.edit=403`. So staff=31 > doctor=20 is expected and is
**not** an escalation. Worth correcting the sentence so nobody later adopts a false
"staff must have fewer permissions than doctor" rule and "fixes" a seed that is right.
Permission counts are in any case outside this branch's risk surface: it touches no route,
no permission code, and no matrix, and `hasPermission()` is byte-unchanged.

**O-2 — the 403 explanation is slightly off, but the conclusion stands.** The record
attributes the three one-off `403` console entries to requests racing ahead "without a
token" after a mid-session `sessionStorage.clear()`. A tokenless request would be rejected
**401** by `authMiddleware`, not 403; a 403 comes from `requirePlane` / `requirePermission`,
i.e. a request that *did* carry a token whose plane or permission did not match the route —
more consistent with a stale or fabricated-blob token from the S-6 setup hitting a guard.
Either way it remains a **test artefact and fail-safe**: a spurious *deny* can never be a
privilege escalation, it is non-reproducible (a clean dashboard load returns `[]` for
`responseStatus >= 400`), and nothing in this diff touches a route or a permission. No
action needed; if it recurs in a run that did **not** clear storage or inject a blob, it
should be investigated then.

---

## 8. Answers to the standing questions (final)

**Primary bug fixed?** Yes, guarded, and confirmed on real hardware at both tablet
viewports with zero login-form renders.

**Exactly one `GET /auth/me` on both paths?** Yes — unit-asserted, killed by M3, observed
`toHaveBeenCalledTimes(1)` in the QA probe, and confirmed on the wire in S-2.

**Atomic failure (ADR-0024)?** Yes, on all four failure shapes, with the correct
user-facing message on each. Verified against the real store and, in S-4, against the real
backend: nothing in `sessionStorage` or `localStorage`, no navigate, picker mounted, one
`/auth/me`.

**R-1 — structurally impossible or merely tested?** Both, split cleanly: *omission* is a
compile error (M10 → TS2345); *a deliberate `false`* compiles and is caught by the test at
`:323` (M2). Now also observed live (S-8): `admin_a` switching All Branches → Downtown
Branch mid-session kept `permissionsLoaded: true` with no spinner.

**RBAC / deny-by-default (AC-13)?** Intact. `hasPermission` untouched (pure
`permissions.includes`). `permissionsLoaded` is read only at `RequirePermission.tsx:43` as
a loading gate, never an authorization input. The F-1 OR was audited specifically for this:
it widens the rescue only to blobs with a **non-empty** permission array, so a
zero-permission session still restores as "unknown" rather than being fabricated into an
authorization answer — verified by the negative-twin probe.

**Plane isolation?** Clean. `platformAuthStore.ts` absent from the diff; no
`permissionsLoaded` concept on that plane; the platform `setAuth` call site still compiles.

**Scope discipline?** Held. 6 modified + 2 new test files. `refreshPermissions()`
internals, `platformAuthStore.ts` and `RoleList.tsx` untouched. `AUTH-BL-1/2/3` left out.

---

## 9. QA protocol checklist (`.claude/roadmap/qa-protocols.md`)

| Protocol | Status |
|---|---|
| P1 — DB / API security | **N/A** — no query, route, controller or repository touched; frontend-only diff |
| P1 — cross-tenant test | **N/A** — no server-side change; `tenant_id` scoping untouched |
| P2 — responsive / touch | ✅ No layout change; exercised at 768×1024 and 1024×768 in P5 |
| P3.3 — network resilience | ✅ Network drop mid-select surfaces the correct specific message, session cleanly retryable (S-4, S-5) |
| P3.4 — authorization edge cases | ✅ Token-expiry/401 handling unchanged; `/403` on zero permissions confirmed (AC-13, unit) |
| **P5 — browser smoke walkthrough** | ✅ **PASS** — 9/9 cases, no findings. [Record attached](./2026-08-19-branch-select-login-flash-smoke.md) |

---

## 10. Sign-off block

```
Feature:  Branch-Select Login Flash / Delayed Dashboard Redirect
Branch:   fix/branch-select-login-flash
Date:     2026-08-20 (round 3, final)
Reviewer: @qa-agent

| Category                    | Tests | Passed | Failed |
|-----------------------------|-------|--------|--------|
| Frontend unit/integration   | 330   | 330    | 0      |
| Mutation checks (QA-run)    | 13    | 11 kill| 2 surv*|
| QA end-to-end probes        | 4     | 4      | 0      |
| P5 browser smoke (live)     | 9     | 9      | 0      |
| Security (tenant isolation) | n/a   | n/a    | n/a    |
| RBAC / plane isolation      | 4     | 4      | 0      |

* both survivors are documented non-issues: N-1 (untested but correct
  malformed-body branch) and N-2 (contrived AC-1 shape with no realistic path)

Issues: F-1 FIXED, F-2 FIXED, F-3 FIXED, F-6 FIXED,
        F-4 closed as documented invariant (INV-REFRESH-1),
        F-5 / N-1 / N-2 carried to backlog,
        O-1 / O-2 documentation notes on the smoke record

[x] Approved for Staging
[x] Approved for Production
```

**QA-Agent Approval: ✅ — STEP 8 (`/anemal-finish-branch`) is unblocked.**

*No source files were modified by this review. Mutation testing was performed against
backups and byte-restored; QA probe files were deleted after use; the working tree was
verified identical to the pre-review state.*
