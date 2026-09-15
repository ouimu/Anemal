# Modal Consolidation — QA Sign-off (Step 7)

**Feature:** modal-consolidation · **Lane:** A · **Step:** 7 (QA gate)
**Author:** @qa-agent · **Date:** 2026-09-15
**Upstream:** Step 6 complete (15 tasks, MODAL-0/1 merged, MODAL-2…MODAL-13)
**Downstream:** Step 8 `@scribe-agent` `/anemal-finish-branch`

---

## 1. Verdict

> ## **CONDITIONAL APPROVE**
>
> The implementation is correct, the architecture conforms to the frozen contract, and every
> acceptance criterion I could verify by test or inspection passes. Three findings from
> `/code-review` were real defects; all three are **fixed and regression-guarded in this branch**.
>
> The verdict is conditional on **three named items in §7** that cannot be closed from inside this
> environment — one of them (**C-1, the Protocol 5 browser smoke walkthrough**) is a *mandatory*
> Step 7 artifact per `.claude/roadmap/qa-protocols.md`, and Step 8 is explicitly blocked without it.

**QA-Agent Approval: ✅ — conditional on C-1, C-2, C-3 below.**
Once C-1/C-2/C-3 are closed, this converts to an unconditional approval with no further QA pass
required. No re-test of the code is needed for any of the three.

---

## 2. Baseline verification

| Check | Result |
|---|---|
| `npx vitest run` (final) | **581 / 581 passed · 71 files** |
| `npx tsc --noEmit` | **clean (exit 0)** |
| Net new tests added at Step 7 | **+16** (565 → 581) |
| Server-side authorization | **unchanged** — no backend, route, permission-code or DB diff |

Suite growth: 565 (inherited baseline) + 10 (RBAC negative-AC tests, §4) + 6 (Dialog stacking and
drag-select guards, §5) = **581**.

---

## 3. Architecture conformance (ADR-0027 + arch brief §4)

`src/frontend/src/components/Dialog.tsx` was compared line-by-line against the frozen contract.
**No drift.**

| Frozen item | Status |
|---|---|
| Module `components/Dialog.tsx`, default export `Dialog`, exports `DialogProps` + `DismissalPolicy` | ✅ |
| `DismissalPolicy = 'dismissible' \| 'explicit' \| 'blocking'` | ✅ |
| Two-branch props union; `onClose` required under dismissible/explicit, optional under blocking | ✅ |
| No `onClose?: never` (removed per Step 3.4b ponytail flag) | ✅ |
| Derived table: dismissible → dialog/X/closes/closes | ✅ |
| Derived table: explicit → dialog/X/closes/**no-op** | ✅ |
| Derived table: blocking → **alertdialog**/none/no-op/no-op | ✅ |
| `role` + `aria-modal` on the **panel**, not the backdrop (F-9 fix) | ✅ guarded by a dedicated test |
| `aria-labelledby` → `useId()` heading id; no `aria-label` | ✅ |
| `<h2>`, token typography, zero raw hex | ✅ |
| Close control ≥ 44×44, accessible name, `type="button"` | ✅ |
| `footer` absent → no footer element; present → outside the scrolling body | ✅ structurally asserted |
| `open=false` **unmounts** (not CSS-hide) | ✅ probe-child cleanup assertion |
| Plane-neutral: imports only `react` + `MaterialIcon` | ✅ asserted twice (Dialog.test + census) |

**Layer rules (`.claude/standards/architecture-rules.md`):** not engaged — this feature adds no
controller, repository, service or transaction. `Dialog` is pure presentation and holds no server
state, which the plane-neutrality allowlist enforces mechanically.

**Realized policy distribution:** 19 `<Dialog>` call sites across 14 files —
**13 dismissible / 5 explicit / 1 blocking**. Every `'explicit'` site is mandated by a plan AC
(MODAL-3 UserManagementTab, MODAL-5 StoragePage, MODAL-6 RoleList, MODAL-9 AdminBloodBank
Collection + Transfusion). See **C-2** — the ADR's illustrative count is stale, the code is right.

---

## 4. Tenant isolation & RBAC

### 4.1 Server boundary re-verified by direct inspection

Every route behind an in-scope modal still carries `requirePlane('clinic')` **and** the correct
permission code — matching the BA §3.4 table and the §6 corrections exactly:

| Route file | Read | Write |
|---|---|---|
| `branch.routes.ts` | `clinic.branch.view` | `clinic.branch.manage` |
| `blood-bank.routes.ts` | `bloodbank.view` | `bloodbank.manage` |
| `product.routes.ts` | `inventory.view` | `inventory.create` / `inventory.edit` / `inventory.adjust` |
| `role.routes.ts` | `requireAnyPermission(['roles.view','roles.manage'])` | `roles.manage` |
| `grooming.routes.ts` | `grooming.view` | `grooming.manage` |
| `appointment.routes.ts` | `appointments.view` | `appointments.create` / `appointments.edit` |

`__tests__/App.routeManifest.test.ts` independently pins the route→permission map
(`branches => clinic.branch.view`, `blood-bank => bloodbank.view`, `inventory => inventory.view`).

### 4.2 Guard-regression audit — the R3 risk did not materialise

A full `git diff` audit of every added/removed line matching
`isSystem|SEALED|canManage|hasPermission|<Can |perm=|isGrantable` across all 19 changed files found
**zero removed guards**. Every hit was an *addition* (`<Can perm="inventory.create">`,
`<Can perm="inventory.edit">`, `canWrite`, `canEditStatus`). No markup restructure dropped a
privilege check.

### 4.3 Negative ACs — two gaps found and closed

Spot-checking the four sites named in the Step 7 brief found the negative ACs correctly written
against **permission codes**, never against the legacy `role` string (BA F-3 / R4 honoured
throughout). Two ACs, however, had **no assertion at all**:

| Site | Before | Action |
|---|---|---|
| MODAL-4 ClinicAppointments (doctor read-only) | ✅ covered — deny branch executed, footer absent without `appointments.edit` | none |
| MODAL-10 ClinicInventory (doctor view-only) | ✅ covered — 5 tests, fields disabled, no submit control, mutation not called | none |
| **MODAL-2 AdminBranches** (`clinic.branch.view` without `.manage`) | ❌ **untested** | **fixed — new file** |
| **MODAL-9 AdminBloodBank** (`clinic_staff` view-only) | ❌ **untested** | **fixed — new file** |

Two new test files close them. Both components carry no client-side gate (by design, unchanged by
this migration), so "no client-side bypass" is asserted in its only falsifiable form: **the write
goes to the server, and a 403 is honoured as a denial rather than presenting as a save.**

- `src/frontend/src/views/admin/__tests__/AdminBranches.serverDenial.test.tsx` (5 tests) — a 403 on
  create *and* on edit keeps the dialog open, surfaces the server error, and never invalidates the
  branch list; plus the granted counterpart, which pins the close.
- `src/frontend/src/views/admin/__tests__/AdminBloodBank.staffViewOnly.test.tsx` (5 tests) — denied
  donor registration and denied collection record nothing locally; the denied collection dialog
  keeps `dismissal="explicit"` *after* the 403, so the entry survives a stray backdrop tap.

**Falsifiability proven by mutation.** Injecting an optimistic `onClose()` into `BranchForm.submit`
turned both MODAL-2 denial guards red; reverting restored green.

### 4.4 Cross-tenant

No new query, no repository change, no `tenant_id` surface anywhere in the diff. `@db-agent`'s W0
no-op assessment holds. **No STOP-condition was triggered:** no cross-tenant read, no sub-admin
financial read, no offline overwrite, no PII in logs.

---

## 5. `/code-review` findings — triage

Run at the 6→7 handoff as required. 8 findings; **3 fixed here, 5 triaged out with rationale.**
No finding is left open and unexplained.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| **1** | **High** | **Escape leaked past a `blocking` dialog to dialogs stacked underneath** | ✅ **FIXED** |
| **2** | **Medium** | **Backdrop closed on a drag-select that overshot the panel** | ✅ **FIXED** |
| **7** | Low | `display:contents` fieldset dropped the form's vertical rhythm in `StockInModal` | ✅ **FIXED** |
| 3 | Medium | `ClinicAdminsTab` ResetPassword dialog is `dismissible` | ⚠️ out of scope — flag |
| 4 | Medium | `ClinicAdminsTab` Deactivate is `dismissible` while its clinic twin is `explicit` | ⚠️ out of scope — flag |
| 5 | Medium | `AdminBloodBank` `DonorModal` is `dismissible` while its two siblings are `explicit` | ⚠️ AC-conformant — flag |
| 6 | Low/Med | No focus-trap / focus-on-open | ⚠️ explicitly backlogged |
| 8 | Low | ADR census `13/2/1` no longer matches the code | ⚠️ **doc drift → C-2** |

### Finding #1 (High) — the one that mattered

`guards/RequireAuth.tsx:52` renders `IdleLogoutModal` as a **sibling of `<Outlet/>`**, so the
blocking idle warning always opens *on top of* whatever dialog the user already has open. Each
`Dialog` registered its own `document` keydown listener with no notion of which one was topmost.
Pressing Escape to dismiss the warning therefore left the warning up (correct) **while unmounting
the grooming booking / stock adjustment / branch form underneath it** — discarding the user's work.

That is precisely the data-loss path ADR-0027 decision 1 introduces the `'blocking'` policy to
prevent, so the feature was defeating its own safety guarantee at its single most important site.

**Fix:** a module-level stack of open dialogs in `Dialog.tsx`; only the topmost dialog acts on
Escape. A topmost `'blocking'` dialog now *swallows* Escape rather than merely ignoring it.

**Fix for #2:** a press that starts inside the panel and ends on the backdrop is recorded and
suppressed once — React resolves such a click to the nearest common ancestor (the backdrop), so the
panel's `stopPropagation` never ran. This affected all 13 `dismissible` sites on a touch tablet.

**6 new tests** in `__tests__/Dialog.test.tsx` cover both, including the one-shot nature of the
suppression and the return of Escape to the lower dialog after the top one unmounts. **All 6 were
proven falsifiable** — removing either guard turned exactly 5 of them red; reverting restored green.

### Why #3/#4/#5/#6 are flags, not blockers

- **#3, #4** — `ClinicAdminsTab` is a **pre-existing platform-plane consumer**. MODAL-0's AC is an
  explicit *"zero prop, behaviour, or markup change"* pure move, and MODAL-13 scopes the 5 platform
  sites to a **regression check**, not a migration. Changing their dismissal policy here would
  breach both ACs. #4 is a genuine cross-plane inconsistency worth a follow-up.
- **#5** — MODAL-9's AC reads *"'explicit' for any modal recording a collection/transfusion match,
  'dismissible' for view-only detail"*. `DonorModal` is a plain create form, not a match record, and
  every other create/edit form in the feature (AdminBranches, ClinicInventory `ProductModal`,
  `CloneRoleModal`, ClinicGrooming) is `dismissible`. The implementation is **AC-conformant**;
  changing it would break the convention. Recorded as a judgment call for @ba-agent.
- **#6** — *"Focus-trap / focus-on-open for `Dialog`"* is a named backlog item in plan §1 and §4
  (*"Not one of the Step 1 four mandated changes; size separately"*). Correctly deferred. Note that
  fixing #1 materially strengthens the blocking guarantee in the interim.

---

## 6. AC coverage by task

| Task | Coverage | Verdict |
|---|---|---|
| MODAL-0/1 Dialog | `Dialog.test.tsx` — dismissal matrix 3×3, F-9 guard, aria-labelledby, heading level, 44×44, footer-outside-body, unmount probe, plane-neutrality, **+ stacking and drag-select guards** | ✅ |
| MODAL-2 AdminBranches | 8 characterization + **5 new server-denial** | ✅ |
| MODAL-3 UserManagementTab | `explicit`; L100/L144 zero-diff; token fix applied at W3 | ✅ |
| MODAL-4 ClinicAppointments | 7 tests incl. doctor read-only deny branch | ✅ |
| MODAL-5 StoragePage | `explicit`; existing tests updated, not deleted | ✅ |
| MODAL-6 RoleList | `MODAL-6-REGR` system-role delete guard, both directions; 409 in-body error; explicit dismissal | ✅ |
| MODAL-7 ClinicGrooming | 10 tests; footer slot; first coverage | ✅ |
| MODAL-8 CloneRoleModal | 11 tests; `MODAL-8-REGR` ×4 clone lockdown; exact-payload no-escalation guard | ✅ |
| MODAL-9 AdminBloodBank | 18 tests + **5 new staff-view-only**; blood-mismatch acknowledgement guard | ✅ |
| MODAL-10 ClinicInventory | 13 tests incl. doctor view-only ×5; per-modal permission codes not conflated | ✅ |
| MODAL-11 BarcodeScanner | 10 tests; MediaStream cleanup on all 4 close paths + unmount | ✅ |
| MODAL-12 IdleLogoutModal | 13 tests; paired blocking assertion; both planes | ✅ (see C-3) |
| MODAL-13 census | 41 tests; **`toEqual` equality**, BarcodeScanner transitional entry removed | ✅ |

### Privilege-escalation guards (R3 — highest severity class)

- **System-role delete** (`!role.isSystem && canManage`, `RoleList.tsx:341`) — intact, asserted in
  both directions.
- **Clone on system roles only, sealed `clinic_admin` excluded** (`RoleList.tsx:325` +
  the `onClone` ternary at `:366`) — **two independent guards**, 4 assertions.
- **No-escalation subset invariant** — enforced server-side at `role.service.ts:108`
  (`.filter(code => callerPerms.has(code))`) with a `ForbiddenError` on sealed-role clone at `:92`.
  The client is guarded by an **exact-payload assertion** (`['newName','sourceRoleName']`) proving no
  client-supplied permission list can ride along. Correct layering.

### MODAL-13 census — falsifiability proven

The census asserts **equality** (`expect(actual).toEqual(expected)`), not containment, and the
BarcodeScanner transitional entry is correctly **removed** post-MODAL-11. Verified by mutation:
injecting a `fixed inset-0` root into a non-allowlisted file turned the census red, and adding a
second `dismissal="blocking"` site turned the paired single-call-site assertion red. Both reverted.

### Tablet viewport

Structural contract (`flex-col`, `max-h-[90vh]`) asserted at 768 px and 1024 px for MODAL-4/7/9/10/12.
The load-bearing guarantee — footer outside the scrolling body — is asserted **once, at the contract
level**, in `Dialog.test.tsx` (`scrollingBody.contains(footerText) === false`), which is the right
place for it. Per-consumer tests confirm each site routes its actions through `footer`.

---

## 7. Conditions before Step 8

| # | Condition | Owner |
|---|---|---|
| **C-1** | **Protocol 5 browser smoke walkthrough (`anemal-smoke-walkthrough`).** `.claude/roadmap/qa-protocols.md` §Protocol 5 makes this **mandatory** for any release-bound branch touching frontend code — this branch touches 19 frontend files — and states *"A branch cannot reach Step 8 without one attached."* It is a deliberate manual gate requiring a running app and real logins; it cannot be executed from this environment. The role × page table must be attached to the PR. | human / @qa-agent with app access |
| **C-2** | **Amend ADR-0027's consumer census.** It states *"**13 / 2 / 1** over 16 consumers"* and uses that figure as the stated justification for accepting a three-value policy. The code ships **13 / 5 / 1 over 19**. **The code is right and the ADR is stale** — the extra `'explicit'` sites were mandated later, by plan ACs for MODAL-5 and MODAL-9, which postdate the Step 3.4 brief. The decision itself is unaffected; only the illustrative count. A frozen contract that no longer matches the code must not ship uncorrected. | @arch-agent (owns `docs/adr/`) |
| **C-3** | **MODAL-12 manual assistive-technology check.** ADR-0027 and MODAL-12's AC both record that `aria-live="assertive"` was deliberately dropped in favour of `role="alertdialog"` on mount, *"verified by @qa-agent with assistive technology, not asserted automatically."* Confirmed removed from the component and `alertdialog` confirmed present by test; the *announcement* itself cannot be verified in jsdom. **Non-blocking per the Step 7 brief — flagged, not overridden.** Fold into C-1's walkthrough. | human / @qa-agent with AT access |

---

## 8. Risk carried into Step 8 — pre-existing suite flake

**Not caused by this feature, but it will affect the ship gate.** Two tests fail intermittently under
full-suite parallel load and pass 100 % in isolation:

- `src/frontend/src/__tests__/ClinicInpatient.test.tsx` — LC-4 medication/care-note payload test
- `src/frontend/src/__tests__/AddOwnerModal.idcard.test.tsx` — idCardType/idCardNumber payload test

**Evidence it predates this branch:** both files are untouched by the diff (`git status` clean for
both). Across six full-suite runs the failing set was non-deterministic (3 → 1 → 2 → 1 → 3 → **0**).
Decisively, **holding out the two test files added at Step 7 and re-running still reproduced the
ClinicInpatient failure (564/565)**. Suite duration varied 48 s–127 s on the same machine, so the
failures track CPU contention: both tests chain several `await userEvent.type(...)` calls against
vitest's default 5 s `testTimeout`, and `src/frontend/vite.config.ts` sets no explicit timeout.

The final verification run was **581/581 green**, so the ship gate *can* pass — but @scribe-agent
should expect to re-run on a red result rather than treat it as this branch's regression.

**Filed as a Lane B follow-up: `task_4b3cfb7b` — "Fix load-sensitive vitest flake in frontend suite"**
(config-level `testTimeout` raise; no product-code change).

---

## 9. Follow-ups filed (none blocking)

1. `task_4b3cfb7b` — pre-existing vitest load flake (§8).
2. **@ba-agent judgment call** — dismissal policy for `ClinicAdminsTab` ResetPassword / Deactivate
   (findings #3/#4: the platform plane now behaves differently from the clinic plane for the
   identical destructive action) and `AdminBloodBank` `DonorModal` (#5).
3. **Backlog, already recorded in plan §4** — focus-trap / focus-on-open for `Dialog` (#6); the
   legacy `role`-string gates in `AdminLayout.tsx:36` / `ClinicLayout.tsx:31` (BA F-3).
4. Minor doc nit — `ClinicGrooming.bookingModal.test.tsx`'s footer test comment claims a structural
   guarantee its assertion does not make; the guarantee *is* genuinely covered at the contract level
   in `Dialog.test.tsx`. Comment wording only, no coverage gap.

---

## 10. Files changed by this QA pass

**Fixes (code):**
- `src/frontend/src/components/Dialog.tsx` — topmost-dialog Escape stack (#1); drag-select backdrop
  suppression (#2)
- `src/frontend/src/views/clinic/ClinicInventory.tsx` — `StockInModal` vertical rhythm (#7)

**Tests added:**
- `src/frontend/src/views/admin/__tests__/AdminBranches.serverDenial.test.tsx` (new, 5 tests)
- `src/frontend/src/views/admin/__tests__/AdminBloodBank.staffViewOnly.test.tsx` (new, 5 tests)
- `src/frontend/src/__tests__/Dialog.test.tsx` (+6 tests)

---

**QA sign-off:** CONDITIONAL APPROVE — **QA-Agent Approval: ✅** subject to C-1, C-2, C-3.
@qa-agent · 2026-09-15
