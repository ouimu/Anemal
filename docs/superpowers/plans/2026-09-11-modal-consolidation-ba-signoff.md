# Modal Consolidation — BA Validation & Authorization Design (Step 3)

**Feature:** modal-consolidation · **Lane:** A · **Step:** 3 (requirement validation + authz design)
**Author:** @ba-agent · **Date:** 2026-09-11 · **Spec ID:** BA-MODAL-01
**Upstream:** `docs/superpowers/plans/2026-09-11-modal-consolidation-pm-tasks.md` (Step 2, @pm-agent)
**Downstream:** Step 3.4 `@arch-agent` → Step 3.4b `@ponytail-agent` (arch-precheck) → Step 3.5 `/grill-with-docs`

**Authority used:** `anemal-rbac-matrix` (canonical permission catalogue + route map) ·
`anemal-ba-toolkit` (structure) · `anemal-functional-reqs` (FR/NFR refs) · live code on `main`
(verified, not inferred — see §3).

---

## 1. Executive Summary & Verdict

**Verdict: SIGN-OFF GIVEN — CONDITIONAL.**

| Scope | Verdict |
|---|---|
| MODAL-1 … MODAL-11, MODAL-13 | **READY**, conditional on the corrections in §6 being folded into the task list before `/write-plan` |
| **MODAL-12** (`IdleLogoutModal`) | **NOT READY — BLOCKED.** Applying the Step-1 unified standard to this site is an accessibility regression and a session-security UX trap (§5.4). Needs a human decision at Step 3.5. It must not enter `/write-plan` as written. |
| Step 3.4 arch tier | **`brief` tier REQUIRED** — not optional, not skippable (§5.2) |

The PM breakdown is structurally sound: the site inventory, dependency graph, out-of-scope
boundary (Phase 7 god-components) and the "MODAL-1 gates everything" sequencing are all correct
and I am not reopening them. What it got wrong is **permission codes** (it inferred four codes that
do not exist anywhere in the catalogue or the codebase), **counts** (13 modal roots and 18 total
call sites, not 11), and a set of **negative acceptance criteria that test the wrong guard** and
would cause QA to certify a known defect as intended behaviour.

**Three things a reader should not miss:**
1. `clinic.branch.edit`, `roles.edit`, `bloodbank.create/edit`, `staff.edit`, `inventory.manage`
   **do not exist.** Verified by full-tree grep of `src/` — zero hits. §4 gives the real codes.
2. `PlatformModal` on `main` has **no `closeOnBackdropClick` prop**. Two tasks (MODAL-3, MODAL-6)
   have acceptance criteria that depend on it. MODAL-1 must *add* it — this is a contract
   **addition**, not a restyle, and it is the core of why arch tier is `brief`.
3. Two layout components (`AdminLayout.tsx:36`, `ClinicLayout.tsx:31`) enforce a **legacy
   `role`-string gate that contradicts the permission matrix**. It is pre-existing, out of scope
   here, and it invalidates five of the PM's negative ACs (§5.3).

---

## 2. Business Context & Objective

**Objective (one sentence):** Every dialog in the clinic product should look, behave and announce
itself the same way, so staff on a tablet build one muscle memory instead of eleven, and so future
dialog work costs one component change instead of eleven file changes.

**Business value:** Maintainability + touch-UX consistency. There is **no new clinical or commercial
capability** in this feature — every site already does its job.

**Scope traceability:** This is a UI-shell change, so it sits outside the FR-01…FR-16 Must/Should
ladder. It is bounded by the Step 1 human sign-off, and it *touches* screens governed by FR-02
(branches), FR-04 (appointments), FR-06 (inventory), FR-09 (grooming), FR-10 (blood bank),
FR-14 (RBAC/roles) and FR-01 (session/auth). NFR touched: **Touch UX (≥ 44×44px)**.

**Challenge to the objective — accepted, with one qualification.** The objective is legitimate and
I am not pushing back on the feature. But "unified standard, no per-site exceptions" is a
*presentation* rule that was approved without anyone checking whether all eleven sites are
presentationally the same kind of thing. Two of them are not: a **camera viewfinder** (#10) and a
**timed session-expiry alert** (#11). Those are not modals-that-drifted; they are different dialog
species. Forcing them into one shell is where this feature can do net harm. See §5.4 and §5.5.

---

## 3. AS-IS (verified on `main`, not inferred)

All findings below were read from live code on `main`, not from the `910b70c` worktree the PM
referenced. Where the two disagree, `main` wins.

### 3.1 `PlatformModal` current contract — `src/frontend/src/components/platform/PlatformModal.tsx`

| Fact | Value on `main` | PM doc assumed |
|---|---|---|
| Props | `title`, `open`, `onClose`, `children`, `width?` | + `closeOnBackdropClick` |
| `closeOnBackdropClick` | **DOES NOT EXIST** | exists |
| Backdrop click | **always** closes (`onClick={onClose}` on the overlay) | configurable |
| `role="dialog"` + `aria-modal` | present — **on the full-screen overlay div**, not the panel | present |
| Accessible name | `aria-label={title}`, duplicating the visible `<h2>` | — |
| Heading | `<h2 class="text-headline-sm font-headline font-bold text-on-surface">` | `<h2>` ✓ |
| Close (X) | present, `min-h-[44px] min-w-[44px]`, `aria-label="Close modal"` | ✓ |
| Escape | closes | ✓ |
| Focus management | **none** | none ✓ (correctly backlogged) |
| Plane coupling | **none** — pure presentation, no store/auth imports | — |

### 3.2 True blast radius — 18 call sites, both planes

| Group | Count | Detail |
|---|---|---|
| Clinic-side modal roots in the 11 in-scope files | **13** | `UserManagementTab.tsx` holds **3** (lines 100, 144, 253), not 1 |
| Existing platform-plane `<PlatformModal>` usages | **5** | `ClinicAdminsTab.tsx` (3), `CustomerListView.tsx` (1), `PlatformPlansView.tsx` (1) |
| **Total consumers after migration** | **18 across both planes** | PM doc says "11+" |

The 5 platform consumers already exist and are **not in the PM's task list at all** — any prop
change in MODAL-1 hits them, and MODAL-13's consistency check does not cover them.

### 3.3 Per-site AS-IS a11y state (drives the real value of each task)

| # | Site | `role="dialog"`? | Heading | Close X | Migration gain |
|---|---|---|---|---|---|
| 1 | `AdminBranches` | **no** | `<h3>` | no | High |
| 2 | `UserManagementTab` — `DeactivateConfirmDialog` (L253) | yes, `aria-label`, **no heading** | none | no | High |
| 2b | `UserManagementTab` — main edit (L100) | **no** | `<h3>` | — | *out of scope* |
| 2c | `UserManagementTab` — self-demotion (L144) | yes | `<h3>` | — | **unassigned — see §5.6** |
| 3 | `ClinicAppointments` — `AppointmentDetail` (L216) | **no** | `<h3>` | no | High |
| 4 | `StoragePage` (L333) | **no** | `<h3>` | no | High |
| 5 | `RoleList` — `DeleteDialog` (L50) | yes | `<h3>` | no | Medium |
| 6 | `ClinicGrooming` (L100) | **no** | — | no | High |
| 7 | `CloneRoleModal` (L45) | yes | `<h3>` | yes | Medium |
| 8 | `AdminBloodBank` (L62) | **no** | — | no | High |
| 9 | `ClinicInventory` (L186) | **no** | `<h3>` | no | High |
| 10 | `BarcodeScanner` (L23) | **yes + `aria-modal` + `aria-label` + close X** | — | **yes** | **≈ zero** |
| 11 | `IdleLogoutModal` (L11) | **`role="alertdialog"` + `aria-live` — deliberately not dismissible** | `<p>` | **none, by design** | **negative** |

Note: `ClinicAppointments.tsx:122` is a `w-80` side **drawer**, not a modal. Correctly excluded.

### 3.4 Server-side authorization AS-IS (all verified in `src/backend/routes/`)

| Route file | Read | Write |
|---|---|---|
| `branch.routes.ts` | `clinic.branch.view` | `clinic.branch.manage` (POST/PUT + shifts) |
| `user.routes.ts` | `staff.view` | `staff.manage` (POST/PUT/PATCH password/**DELETE = deactivate**); `staff.assign_branch` on branch routes |
| `appointment.routes.ts` | `appointments.view` | `appointments.create`; `appointments.edit` (PUT `/:id/status`) |
| `settings.routes.ts` storage | `clinic.profile.view` (GET `/clinic/storage-config`) | `clinic.integrations.edit` (PUT + both OAuth authorize routes) |
| `role.routes.ts` | `requireAnyPermission(['roles.view','roles.manage'])` | **`roles.manage`** (clone, update perms, delete) |
| `grooming.routes.ts` | `grooming.view` | `grooming.manage` |
| `blood-bank.routes.ts` | `bloodbank.view` | **`bloodbank.manage`** (donors, collections, transfusions) |
| `product.routes.ts` | `inventory.view` | `inventory.create` / `inventory.edit` (PUT + DELETE=deactivate) / `inventory.adjust` (stock-in) |

Server enforcement is correct and deny-by-default throughout. **No backend change is required by
this feature.** The security boundary is intact and this migration does not touch it.

---

## 4. Answers to the PM's three open questions

### Q1 — Exact write-permission codes

**Four codes the PM used do not exist.** Full-tree grep of `src/` for `roles.edit`,
`clinic.branch.edit`, `bloodbank.create|bloodbank.edit`, `staff.edit`, `inventory.manage` returns
**zero matches** (the only `roles.edit*` hits are i18n keys `roles.editorTitle` /
`roles.editorSubtitle`). Canonical replacements:

| Task | PM's code | **Canonical code** | Verdict |
|---|---|---|---|
| MODAL-2 branch save | `clinic.branch.edit` | **`clinic.branch.manage`** | ❌ → corrected |
| MODAL-3 deactivate user | "staff manage-level" | **`staff.manage`** (`DELETE /users/:id`) | ✔ clarified |
| MODAL-4 in-modal actions | "`appointments.edit` or equivalent" | **`appointments.edit`** (status), **`appointments.create`** (book) | ✔ confirmed |
| MODAL-5 storage switch | `clinic.integrations.edit` | **`clinic.integrations.edit`** | ✔ confirmed |
| MODAL-6 role delete | `roles.edit` | **`roles.manage`** | ❌ → corrected |
| MODAL-8 role clone | `roles.edit` | **`roles.manage`** | ❌ → corrected |
| MODAL-9 blood bank write | "confirm" | **`bloodbank.manage`** | ✔ resolved |
| MODAL-10 inventory write | "confirm" | **`inventory.create`** / **`inventory.edit`** / **`inventory.adjust`** (three distinct codes — the modal that does stock-in is a *different* permission from the one that edits an item) | ✔ resolved |
| MODAL-11 scanner | "inventory.view or billing screen's permission" | **`inventory.view`** only — see below | ❌ → corrected |

**MODAL-11 correction:** `BarcodeScanner` has exactly **one** mount point in the entire frontend —
`views/clinic/ClinicInventory.tsx`. There is no billing mount. (`/clinic/billing` is additionally
gated on `billing.create`, which doctor does not hold, so it is not reachable by the role the PM
assumed anyway.) The AC "confirm exact call sites at implementation time" is now closed: it is one
site, `inventory.view`.

**Permission decision blocks (canonical, for @qa-agent to test against):**

```
Module.Action: clinic.branch.manage    Default roles: clinic_admin    Configurable: yes (custom roles)
Rationale: branch topology is clinic configuration, not clinical or commercial operation.
Risk if wrong: a non-admin creating/renaming branches corrupts the branch-scoping every
inventory and appointment query depends on.
```
```
Module.Action: roles.manage            Default roles: clinic_admin    Configurable: yes
Rationale: single code covers clone + permission-edit + delete; the no-escalation subset rule
(anemal-rbac-matrix §Custom-role safety) is the real guard, not action granularity.
Risk if wrong: privilege escalation — the highest-severity failure in the product.
```
```
Module.Action: bloodbank.manage        Default roles: clinic_admin, doctor    Configurable: yes
Rationale: donor eligibility, collection and transfusion are clinical judgements; clinic_staff
holds bloodbank.view only (front-desk visibility of stock, no clinical write).
Risk if wrong: a non-clinician recording a transfusion match — patient-safety severity.
```
```
Module.Action: inventory.adjust        Default roles: clinic_admin, clinic_staff   Configurable: yes
Rationale: stock movement is a commerce/ops action, distinct from inventory.edit (item master
data). Doctor holds inventory.view only — reads stock when prescribing, never moves it.
Risk if wrong: silent stock drift; inventory reports and auto-deduct both lose integrity.
```

### Q2 — Arch tier for MODAL-1: **`brief` — REQUIRED**

The PM read the CLAUDE.md trigger list literally and got "skip." That reading is wrong here, for
five independent reasons, any one of which is sufficient:

1. **The plan is built for parallel execution.** MODAL-2…MODAL-12 each depend only on MODAL-1 —
   that is a fan-out design. CLAUDE.md: *"Step 6 parallelism is legal **only** when `@arch-agent`
   froze the contract at 3.4; otherwise sequence."* Skipping arch does not save a step; it
   converts Step 6 from four parallel workers into one sequential worker. **This alone decides it.**
2. **MODAL-1 is a contract addition, not a restyle.** `closeOnBackdropClick` does not exist on
   `main`, and two tasks' ACs already assume it. Adding a behavioural prop to a component with 18
   consumers is exactly a shared-contract change.
3. **Cross-plane shared component.** `PlatformModal` is consumed by 5 platform-plane call sites and
   (post-migration) 13 clinic-plane ones, plus `IdleLogoutModal` which mounts in *both*
   (`guards/RequireAuth.tsx:52` clinic, `layouts/PlatformLayout.tsx:148` platform). Its
   plane-neutrality is currently accidental (it happens to import nothing from the auth store).
   That neutrality must be **frozen as an explicit constraint**, or a future dev adds a
   `useAuthStore` call and fuses the planes through a UI component. This is a plane-boundary
   concern, which *is* on the arch trigger list.
4. **A structural variant is required** (sticky footer for #6), i.e. the component grows a second
   shape — a pattern decision, not a styling decision.
5. **The a11y fix is an interface change.** `role="dialog"`/`aria-modal` currently sit on the
   click-to-close overlay rather than the panel, and `aria-label` duplicates the visible `<h2>`.
   Doing this properly means `aria-labelledby` pointing at a generated heading id — a new prop or a
   new internal id contract, which every consumer inherits.

**Instruction to @arch-agent (Step 3.4, `brief` tier):** freeze the `PlatformModal` prop contract
(including the sticky-footer variant's shape and the dismissal-policy prop), state the
plane-neutrality constraint as a rule, and specify the accessible-naming mechanism. Do **not**
design the per-site migrations — those are `@uiux-agent` at Step 6. I am flagging the constraint,
not the solution: class design, prop naming and composition pattern are yours.

### Q3 — Doctor's access level on AdminBloodBank (MODAL-9)

**Answer by the authorization model: doctor has FULL access — read *and* write.**

| Role | `bloodbank.view` | `bloodbank.manage` | Effective |
|---|:---:|:---:|---|
| `clinic_admin` | V | E | full |
| **`doctor`** | **V** | **E** | **full — donors, collections, transfusions** |
| `clinic_staff` | **V** | **–** | **view only** |

Confirmed on both sides: `anemal-rbac-matrix` grid, and `blood-bank.routes.ts:11-16`
(`bloodbank.view` on all three GETs, `bloodbank.manage` on all three POSTs). The screen route is
gated `bloodbank.view` (`App.tsx:120`), and `AdminLayout`'s nav entry is
`{ to:'/clinic-admin/blood-bank', perm:'bloodbank.view' }`.

**Two corrections to the PM's table follow:**

- **`clinic_staff` is a missing actor.** The PM listed `doctor / clinic_admin` only. `clinic_staff`
  holds `bloodbank.view` and can open the screen — but must **not** be able to submit the modal.
  MODAL-9 currently has **no read-only-role acceptance criterion at all**. Added in §6.
- **Doctor cannot actually reach the screen today** — but not for an authorization reason. See §5.3.

---

## 5. Findings (finding → impact → recommendation → rationale)

### 5.1 F-1 · Permission codes invented rather than looked up — **Medium, closed**
**Finding:** four non-existent codes across five tasks (§4 Q1).
**Impact:** `requirePermission('roles.edit')` would throw or silently deny; QA would write tests
asserting a code that can never be granted.
**Recommendation:** apply the §4 table verbatim. No further action.
**Rationale:** the catalogue is the contract; inference from route names is not a substitute.

### 5.2 F-2 · Arch tier — **resolved, see §4 Q2.**

### 5.3 F-3 · Legacy `role`-string layout gates contradict the permission matrix — **High, out of scope, must not be encoded**

**Finding:** two layouts enforce a legacy role string that the RBAC model retired:
- `layouts/AdminLayout.tsx:36` — `if (role !== 'admin') return <Navigate to="/clinic/dashboard" replace />`
- `layouts/ClinicLayout.tsx:31` — `if (role === 'admin') return <Navigate to="/clinic-admin/dashboard" replace />`

`authStore` carries **both** `role: string` (legacy) and `permissions: string[]` (RBAC). The
layouts use the former; every route guard uses the latter. Consequences:

| Screen | Matrix says | Layout does |
|---|---|---|
| `/clinic-admin/blood-bank` (MODAL-9) | doctor: view + manage; clinic_staff: view | **both bounced to `/clinic/dashboard`** |
| `/clinic/appointments` (MODAL-4) | clinic_admin: view/create/edit/delete | **clinic_admin bounced to `/clinic-admin/dashboard`** |
| `/clinic/inventory` (MODAL-10) | clinic_admin: view/create/edit/adjust | **clinic_admin bounced** |
| `/clinic/grooming` (MODAL-7) | clinic_admin: view + manage | **clinic_admin bounced** |

**Impact:** *No security impact* — it fails closed, and the server still enforces correctly
(a doctor could call `POST /blood-bank/donors` directly and would be correctly allowed). The impact
is (a) a capability granted in the matrix with no UI to reach it, and (b) **five PM acceptance
criteria of the form "a role without X cannot reach the screen — existing guard, verified" would
pass for the wrong reason**, freezing the defect into the test suite as intended behaviour.

**Recommendation:**
1. **Out of scope for this branch.** Do not fix it here — it is behaviour change unrelated to modals.
2. Rewrite the five affected ACs per §6 so they assert *server* denial (403) plus route-guard
   behaviour, and explicitly **do not** assert screen-unreachability by role string.
3. File a separate **Lane B** bug: *"Retire legacy `role`-string gates in AdminLayout/ClinicLayout in
   favour of permission checks."* Backlogged, not scheduled here.

**Rationale:** *Server is the security boundary; UI gating is UX only.* A UI-only inconsistency is a
usability defect, not a vulnerability — but a test that certifies it is a durable problem.

### 5.4 F-4 · MODAL-12 `IdleLogoutModal` — the unified standard is an a11y regression here — **BLOCKING**

**Finding:** `IdleLogoutModal` is `role="alertdialog"` + `aria-live="assertive"`, with **no close
button, no Escape handler and no backdrop dismissal**. Its only exit is the "Stay logged in"
button. Its props are `{ open, secondsLeft, onStay }` — there is **no `onClose` at all**.
`PlatformModal` requires `onClose`, closes on Escape, and closes on backdrop click.

The Step 1 human decision mandates `role="dialog"` + a visible close (X), for all sites, no
exceptions. Applying it here means:

| Change | Consequence |
|---|---|
| `alertdialog` → `dialog` | **WCAG regression.** `alertdialog` is the correct role for a timed interruption requiring a response; `dialog` drops the assertive announcement a countdown needs. |
| Add close (X) | **Ambiguous affordance.** Does X mean "stay logged in" or "hide this and keep counting down"? Either reading is a trap. |
| Escape / backdrop close | **Session-security UX trap.** A user dismisses the warning, believes the session is safe, keeps typing into an unsaved clinical form, and is logged out with no visible warning. Data loss on a tablet, mid-consult. |

**Impact:** this is the one site where the feature makes the product **worse**, and the failure mode
lands on unsaved clinical data.

**Recommendation — needs a human, I will not decide it unilaterally.** Put this to Step 3.5
`/grill-with-docs` as an explicit decision, with two options:

```
Option A: Carve out MODAL-12 — IdleLogoutModal keeps alertdialog, no close X, no dismissal.
  Pros:  correct a11y semantics; no data-loss path; smallest change.
  Cons:  the Step 1 "no per-site exceptions" rule is broken on day one.
  Risks: precedent — future devs cite it to skip the standard. Mitigate: the exception is
         recorded in the arch doc with its reason, same bar as the ClinicGrooming exception.
  Complexity: L

Option B: MODAL-1's standard is defined as "the dialog role family" — role=dialog OR
  role=alertdialog where semantically correct — and dismissal policy becomes an explicit,
  per-consumer prop with a deny-by-default value (not dismissible unless the consumer opts in).
  Pros:  keeps "one standard, no per-site judgement calls" genuinely true; the standard states a
         rule rather than a fixed string; directly serves the destructive-confirm need in
         MODAL-3 and MODAL-6, which need non-dismissible behaviour anyway.
  Cons:  slightly larger MODAL-1 contract; needs the human to amend the Step 1 wording.
  Risks: scope creep into MODAL-1. Mitigate: @arch-agent freezes it at 3.4, one prop.
  Complexity: M

Recommendation: Option B. It is the only one that satisfies the actual objective — "no per-site
inconsistency" — without either regressing accessibility or requiring a permanent carve-out.
It also absorbs the destructive-confirm requirement that MODAL-3 and MODAL-6 already have and
that main's PlatformModal cannot currently express.
```

**Until this is decided, MODAL-12 is NOT READY and must not enter `/write-plan`.**

### 5.5 F-5 · MODAL-11 `BarcodeScanner` — wrong priority, near-zero benefit, real risk — **Medium**

**Finding:** `BarcodeScanner` already has `role="dialog"`, `aria-modal="true"`,
`aria-label="Barcode Scanner"` and a close button (`aria-label="Close scanner"`). It is the **only
one of the eleven that already meets the standard**. Against that near-zero benefit sit two real
risks the PM correctly flagged but did not price: a camera viewfinder in a `max-w-lg` / `p-md`
shell, and media-stream cleanup on unmount.

**Impact:** highest-risk, lowest-value task in the set. A leaked `MediaStream` leaves the tablet
camera light on after close — visible, alarming to clients in a consult room, and a plausible
privacy complaint.

**Recommendation:** **re-prioritise MODAL-11 to last**, after MODAL-13's consistency pass, and give
it an explicit *"defer with recorded reason"* exit. It is a `Could`, not a `Must`. Its one genuine
gain — converging title typography — is not worth a camera regression.

**Rationale:** *Recommend standard before custom* cuts both ways: a site already conforming to the
standard does not need to be rebuilt to prove it.

### 5.6 F-6 · `UserManagementTab` has three modal roots; MODAL-3 addresses one — **Medium**

**Finding:** modal roots at lines **100** (main edit, explicitly out of scope), **144**
(`roles.selfDemotionTitle` self-demotion confirm — **not mentioned anywhere in the task list**) and
**253** (`DeactivateConfirmDialog`, the only one in scope).

**Impact:** two consequences. (a) The self-demotion confirm is **unowned** — nobody decided whether
it is in or out. (b) MODAL-13's AC *"All 11 migrated sites use identical header/title/close-button
markup (diff-check, not eyeball)"* **cannot pass** on this file, because two non-conforming dialogs
remain in it by design. MODAL-13 as written is unsatisfiable.

**Recommendation:** decide the self-demotion dialog explicitly (my recommendation: **out of scope**,
same Phase-7 bucket as the main edit modal, since both live in the same sticky-footer-conflicted
file), and rewrite MODAL-13's AC to scope the diff-check to *migrated roots*, with a named
exclusion list. §6 gives the wording.

**Rationale:** an acceptance criterion that cannot be satisfied is worse than a missing one — it
either blocks the gate or gets quietly downgraded.

### 5.7 F-7 · MODAL-13 does not cover the 5 existing platform-plane consumers — **Medium**

**Finding:** `ClinicAdminsTab.tsx` (3 usages), `CustomerListView.tsx` (1), `PlatformPlansView.tsx`
(1) already consume `PlatformModal` and appear nowhere in the task list.

**Impact:** MODAL-1 changes the contract these five call sites depend on. They are a **regression
surface with no assigned verification**. If MODAL-1 adds a required prop or changes the header
markup, three platform screens change appearance or break, and no AC catches it.

**Recommendation:** add to MODAL-13 an AC covering the 5 platform-plane usages as a
**regression check** (they are already compliant consumers; they must keep working and must render
identically to the migrated clinic sites). Do not add them as migration tasks — they need no
migration.

### 5.8 F-8 · Business rules missing from the role-modal ACs — **Medium**

**Finding:** `RoleList.tsx` and `useUserRoles.ts` encode three rules the ACs omit:
- **Clone is offered on system roles only** (`role.isSystem && … && canManage`, L324).
- **`clinic_admin` is a sealed role** (`SEALED_ROLE_KEY = 'clinic_admin'`) — **cannot be cloned**,
  and is grantable only by a caller holding every one of its permissions (`isGrantable`, L50-52).
- **Delete is offered on non-system roles only** (`!role.isSystem && canManage`, L340) — system
  roles are immutable, consistent with `anemal-rbac-matrix` custom-role safety rule #2.

**Impact:** MODAL-8's AC *"Cloning produces a new role with the source role's permission set"* is
true but incomplete, and MODAL-6's *"Confirm deletes an unused role"* omits system-role
immutability. A dev migrating the markup could restructure the conditional and silently drop a
privilege-escalation guard — the highest-severity failure class in this product.

**Recommendation:** add the three rules as explicit ACs (§6). These are **regression assertions on
existing behaviour**, not new features.

### 5.9 F-9 · `role`/`aria-modal` sit on the dismissing overlay, and the accessible name duplicates the heading — **Low, hand to @arch-agent**

**Finding:** `PlatformModal` puts `role="dialog"`, `aria-modal="true"` and `aria-label={title}` on
the full-screen overlay div that also carries `onClick={onClose}`; the actual panel is the child.
**Impact:** the dialog's accessible name duplicates the visible `<h2>`, and the element announced
as the dialog is the backdrop. Minor, but it undercuts the stated purpose of the whole feature.
**Recommendation:** @arch-agent specifies the accessible-naming mechanism (`aria-labelledby` →
generated heading id) as part of the frozen contract. Technical constraint flagged; the design is
theirs.

### 5.10 Noted, no action (out of scope, recorded so nobody re-derives them)

- `/settings/storage` gates the **view** route on `clinic.integrations.edit` (an edit code). Means
  there is no read-only storage viewer, so MODAL-5 has no "read-only role" case to test. Correct
  as-is; pre-existing pattern, consistent with the PUT.
- `/clinic/billing` gates on `billing.create`, not `billing.view` — same view/edit pattern. Out of
  scope (Phase 7), noted because it disproves the PM's assumption of a billing scanner mount.
- `anemal-rbac-matrix` §3 route map names **`rbac.routes`**; the file on disk is
  **`role.routes.ts`**. Documentation drift only, enforcement is correct. Worth a one-line skill fix
  by @scribe-agent at Step 8 — not this branch's problem.

---

## 6. Required corrections to the task list (apply before `/write-plan`)

| Task | Correction | Type |
|---|---|---|
| **MODAL-1** | Add: the standard must express a **dismissal policy** (destructive/timed dialogs are not dismissible by backdrop or Escape); `closeOnBackdropClick` **does not exist on `main`** and must be added, not assumed. Add: the contract is **plane-neutral** — `PlatformModal` must import nothing from the auth store or any tenant context. Add: accessible name via `aria-labelledby`, not a `title`-duplicating `aria-label`. | **Must** |
| **MODAL-2** | Permission: `clinic.branch.view` (screen) + **`clinic.branch.manage`** (save). Replace `clinic.branch.edit`. | **Must** |
| **MODAL-3** | Permission: `staff.view` (screen) + **`staff.manage`** (`DELETE /users/:id`). Add: state that the **self-demotion confirm (L144) is also out of scope** — name it, so "zero diff" is checkable against a known list. | **Must** |
| **MODAL-4** | Permissions: `appointments.view` (screen), **`appointments.edit`** (status change), **`appointments.create`** (book). Add negative AC: **`doctor` holds `appointments.view` only** — detail modal opens read-only; any in-modal write returns **403** from the server. | **Must** |
| **MODAL-5** | Confirmed `clinic.integrations.edit`. No change. | — |
| **MODAL-6** | Permission: `roles.view` (screen) + **`roles.manage`** (delete). Replace `roles.edit`. Add AC: **system roles expose no delete control** (`!role.isSystem && canManage`) — regression assertion. | **Must** |
| **MODAL-7** | Confirmed `grooming.view` / **`grooming.manage`** (add the write code — the PM listed view only). Doctor exclusion confirmed against the matrix: `grooming.view` is **denied** to doctor, so the route comment is correct and authoritative. | **Must** |
| **MODAL-8** | Permission: `roles.view` + **`roles.manage`**. Add ACs: **clone is offered on system roles only**; **`clinic_admin` is sealed and cannot be cloned** (`SEALED_ROLE_KEY`); the cloned role's permissions must remain a **subset of the caller's own** (no escalation). | **Must** |
| **MODAL-9** | Permission: `bloodbank.view` (screen) + **`bloodbank.manage`** (donor/collection/transfusion writes). Add **`clinic_staff` as a third actor — view-only**: screen opens, write modal must not submit (**403**). **Remove/rewrite** any AC asserting doctor cannot reach the screen (see F-3). | **Must** |
| **MODAL-10** | Permissions: `inventory.view` (screen) + **`inventory.create`** / **`inventory.edit`** / **`inventory.adjust`** — enumerate *which modal maps to which code* at implementation; stock-in is `inventory.adjust`, item edit is `inventory.edit`. Add negative AC: **`doctor` holds `inventory.view` only** — no write modal submits. | **Must** |
| **MODAL-11** | Permission: **`inventory.view` only** — one mount point, `ClinicInventory.tsx`; no billing mount exists. **Re-sequence to last**, after MODAL-13. Keep the "recorded, reasoned exception" exit. Add AC: **no orphaned `MediaStream` after any close path** (X / backdrop / Escape / unmount). | **Must** |
| **MODAL-12** | **BLOCKED** pending the §5.4 human decision at Step 3.5. Do not plan it. | **Blocker** |
| **MODAL-13** | Rewrite the consistency AC: diff-check scoped to **migrated modal roots**, with a named exclusion list (`UserManagementTab` L100 + L144; plus MODAL-11 and MODAL-12 if either is carved out). Add AC: **the 5 existing platform-plane `<PlatformModal>` usages render identically and still work** (regression, not migration). Add AC: **`PlatformModal` imports nothing plane-specific** (grep assertion). | **Must** |
| **All negative ACs** | Replace *"a role without X cannot reach the screen — existing guard, verified"* with: *"the route guard `RequirePermission perm=\"X\"` is unchanged, AND a role without X receives **403** from the corresponding API call."* Do **not** assert screen-unreachability by legacy role string (F-3). | **Must** |

---

## 7. Non-Functional Requirement impact

| NFR | Impact | Verdict |
|---|---|---|
| **Touch UX (≥ 44×44px)** | Directly served — `PlatformModal`'s close button is already `min-h-[44px] min-w-[44px]`; eight sites currently have **no** close control at all. | **Positive — the main NFR gain** |
| Performance (page load < 2s / 3G) | Marginally positive: 13 hand-rolled overlays collapse into one shared component. Immaterial either way. | Neutral |
| Security | **None.** No route, middleware, permission code or query changes. Server enforcement untouched. | Neutral |
| Availability / Backup / Scalability | No backend, no DB, no schema, no migration. | None |
| Offline (tablet capture) | **Watch item:** if MODAL-1's dismissal policy changes when a modal unmounts, an in-progress offline capture form could lose state. Applies to MODAL-7 and MODAL-10 (both tablet). Covered by the existing "Cancel/backdrop/Escape close without persisting" ACs. | Low — covered |
| **Maintainability** | The actual objective. 13 roots → 1 component; future dialog changes cost one file. | **Positive** |

**Data model impact: none.** No table, column, index, migration or query is touched. `@db-agent` has
no review surface in this feature — confirm at Step 6 W0 and release the wave.

---

## 8. Risk register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | MODAL-1's contract change breaks the 5 unlisted platform-plane consumers | **High** | Medium | §6 MODAL-13 regression AC; @arch-agent freezes the contract at 3.4 | @arch-agent / @qa-agent |
| R2 | `IdleLogoutModal` migrated as written → dismissible session warning → data loss mid-consult | Medium | **High** | MODAL-12 blocked; §5.4 decision at Step 3.5 | human + @ba-agent |
| R3 | Markup restructure in `RoleList`/`CloneRoleModal` silently drops the sealed-role or system-role guard | Medium | **High** (privilege escalation) | §6 F-8 regression ACs; @qa-agent RBAC suite | @qa-agent |
| R4 | QA certifies the F-3 legacy-role-gate defect as intended behaviour | **High** | Medium | §6 blanket AC rewrite; Lane B bug filed separately | @qa-agent |
| R5 | `BarcodeScanner` migration leaks a `MediaStream` — camera stays live after close | Medium | Medium | MODAL-11 resequenced last + explicit cleanup AC + defer exit | @uiux-agent / @dev-agent |
| R6 | Sticky-footer variant (#6) unresolved at Step 6 → MODAL-7 blocks the wave | Medium | Medium | @arch-agent freezes the variant shape at 3.4, ahead of @uiux-agent's Step 6 styling | @arch-agent |
| R7 | `PlatformModal` later gains a `useAuthStore` import → plane fusion through a UI component | Low | **High** | Plane-neutrality frozen as an arch rule + grep AC in MODAL-13 | @arch-agent / @qa-agent |
| R8 | "No per-site exceptions" erodes into per-dev judgement once the first exception lands | Medium | Medium | Every exception recorded in the arch doc with its reason — same bar for all three candidate sites (#6, #10, #11) | @arch-agent |

---

## 9. Definition of Ready

| Criterion | MODAL-1…11, 13 | MODAL-12 |
|---|---|---|
| Objective stated | ✔ §2 | ✔ |
| Actors & roles named (matrix role keys) | ✔ §4, §6 — incl. the two actors the PM missed | ✔ (all authenticated, both planes) |
| **Permission codes assigned from the catalogue** | ✔ §4 | n/a (no permission gates it) |
| Business rules listed | ✔ §5.8 | ✔ |
| Exceptions & edge cases | ✔ §5 | **✘ — the core exception is unresolved** |
| NFR impact | ✔ §7 | ✔ §7 |
| Acceptance criteria testable by @qa-agent | ✔ after §6 | **✘ — ACs assume a standard that must not be applied as written** |
| Risks & dependencies recorded | ✔ §8 | ✔ R2 |
| **Verdict** | **READY (conditional on §6)** | **NOT READY — BLOCKED** |

---

## 10. Handoff

**→ Step 3.4 `@arch-agent` (tier: `brief`).** Freeze, in the arch doc:
1. The `PlatformModal` prop contract, including the dismissal-policy prop and the sticky-footer
   variant's shape.
2. The **plane-neutrality constraint** as an explicit rule (R7).
3. The accessible-naming mechanism (`aria-labelledby` + heading id) and which element carries
   `role`/`aria-modal` (F-9).
4. The exception bar — one recorded-reason format covering #6 (sticky footer), #10 (viewfinder)
   and, if Option A is chosen at 3.5, #11 (alertdialog).

Class design, composition pattern and prop naming are yours — I have flagged constraints, not
designed the solution.

**→ Step 3.5 `/grill-with-docs`** must resolve, before `/write-plan`:
- **D-1 (blocking):** MODAL-12 — Option A (carve-out) vs **Option B (dismissal policy + dialog role
  family, recommended)**. This amends a Step 1 human decision and therefore needs the human.
- **D-2:** `UserManagementTab`'s self-demotion confirm (L144) — in or out? (BA recommends **out**.)
- **D-3:** MODAL-11 — confirm the re-sequencing to last and the defer exit.

**→ Step 4 `@pm-agent`:** fold §6 into the task list, then `/write-plan`. **MODAL-12 stays out until
D-1 is answered.**

**Backlog items created by this review** (not scheduled here):
1. **Lane B bug** — retire the legacy `role`-string gates in `AdminLayout.tsx:36` /
   `ClinicLayout.tsx:31` in favour of permission checks (F-3).
2. Focus-trap / focus-on-open for `PlatformModal` (carried forward from the PM's backlog —
   confirmed correctly deferred; it is the largest remaining a11y gap after this feature ships).
3. Doc fix — `anemal-rbac-matrix` §3 route map says `rbac.routes`; the file is `role.routes.ts`.

---

**BA sign-off:** given for MODAL-1…MODAL-11 and MODAL-13, conditional on §6.
**MODAL-12 withheld** pending D-1. @ba-agent · 2026-09-11
