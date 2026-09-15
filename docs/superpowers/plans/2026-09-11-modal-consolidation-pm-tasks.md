# Modal Consolidation — Task Breakdown + Acceptance Criteria (Step 2)

**Feature:** modal-consolidation · **Lane:** A · **Step:** 2 (task breakdown + AC)
**Author:** @pm-agent · **Date:** 2026-09-11
**Upstream:** Step 1 `/superpowers:brainstorm` — human sign-off given same session, re-entering
work that was pulled out of Lane D (`code-quality-refactor` branch, Phase 6) after QA finding F-2
(migration produced real rendered-output changes, which Lane D forbids).
**Downstream:** feeds Step 3 (`@ba-agent` validation). Do not proceed past this document.

**Reference material used (NOT pre-approved deliverables, re-derived below):**
- `.claude/worktrees/modal-consolidation` (branch `feature/modal-consolidation`, based on `910b70c` —
  **not an ancestor of `main`**; confirmed via `git merge-base --is-ancestor`. `main`'s
  `AdminBranches.tsx` does not import `PlatformModal` today, so all 11 sites still need the migration
  on `main`.)
- Commit `910b70c` — read as PlatformModal's current shape (title/open/onClose/children/width/
  `closeOnBackdropClick`), not as a frozen contract — its API may still change once `@uiux-agent`
  designs the unified standard at Step 6.
- Commit `01b8348` — characterization tests for `AdminBranches` only; kept as a starting reference,
  not counted as coverage for the other 10 sites.
- `docs/superpowers/plans/HANDOFF-code-quality-refactor.md` lines 266-305 (worktree copy, read-only) —
  full Phase 6 rationale and the QA F-2 finding that routed this work into Lane A.

---

## 1. Scope validation against real clinic workflows

This is a **UI-shell consolidation**, not new clinical/business functionality — every site already
does its job today with hand-rolled modal markup; the change is *how* the dialog is built and *how it
looks/behaves*, not what it does. That keeps it outside the FR-01..FR-16 Must/Should priority ladder
in `anemal-functional-reqs`; scope is instead bounded by the Step 1 human sign-off. No MVP-phase
conflict found. Two scope notes:

- **In scope, full 11 sites**, per Step 1 sign-off — see table below.
- **Explicitly out of scope, backlog (Phase 7 — god-components):** `ClinicPets.tsx` (936 lines, 30
  `useState`), `ClinicBilling.tsx`, `ClinicInpatient.tsx` (799 lines). Reason: these views need
  characterization tests and structural decomposition *before* any shared-component migration touches
  their modals — touching them now would be wasted work redone in Phase 7. Do not touch.
- **Out of scope, this task list:** a focus-trap / focus-on-open a11y improvement. `PlatformModal`
  today has no focus management (confirmed reading `910b70c`'s version — only Escape-key and
  backdrop-click handling). The Step 1 sign-off approved four specific rendered-output changes
  (`role="dialog"`, close button, `<h2>` heading, title restyle) as the new standard; focus trapping
  was not one of them. Flagging as a **backlog item for `@ba-agent`/`@uiux-agent` to size separately**
  rather than folding it into this branch's scope silently.

## 2. Site inventory (11 sites, actor/role/device/permission from live routes)

| # | File | Modal | Route → permission (`App.tsx`) | Actor (role key) | Device | Coverage today |
|---|------|-------|-------------------------------|-------------------|--------|-----------------|
| 1 | `views/admin/AdminBranches.tsx` | `BranchForm` | `/settings/branches` → `clinic.branch.view` | `clinic_admin` | Web | Characterization tests exist (`01b8348`, reference only) |
| 2 | `views/admin/UserManagementTab.tsx` | `DeactivateConfirmDialog` **only** — main edit `Modal` stays untouched (sticky-footer conflict, explicitly out of scope) | `/clinic-admin/users` → `staff.view` | `clinic_admin` | Web | None for this dialog |
| 3 | `views/clinic/ClinicAppointments.tsx` | `AppointmentDetail` | `/clinic/appointments` → `appointments.view` | `clinic_staff` (+ `doctor` view access) | Both | None |
| 4 | `views/settings/StoragePage.tsx` | storage-switch confirm | `/settings/storage` → `clinic.integrations.edit` | `clinic_admin` | Web | None |
| 5 | `components/roles/RoleList.tsx` | `DeleteDialog` | `/clinic-admin/roles` → `roles.view` (delete gated `roles.edit`) | `clinic_admin` | Web | None |
| 6 | `views/clinic/ClinicGrooming.tsx` | grooming detail/edit modal | `/clinic/grooming` → `grooming.view` (doctor excluded by design) | `clinic_staff` | Tablet | Zero |
| 7 | `components/roles/CloneRoleModal.tsx` | clone-role form | same screen as #5, `roles.view`/`roles.edit` | `clinic_admin` | Web | Zero |
| 8 | `views/admin/AdminBloodBank.tsx` | donor/collection modal(s) | `/clinic-admin/blood-bank` → `bloodbank.view` | `doctor` / `clinic_admin` | Both | Zero |
| 9 | `views/clinic/ClinicInventory.tsx` | inventory item modal(s) | `/clinic/inventory` → `inventory.view` | `clinic_staff` | Tablet | Zero |
| 10 | `components/BarcodeScanner/BarcodeScanner.tsx` | scanner overlay | shared component, mounted from inventory/billing flows | `clinic_staff` | Tablet | Zero |
| 11 | `components/IdleLogoutModal.tsx` | session-idle warning | global, both planes | all authenticated roles (clinic + platform) | Both | Zero |

All 11 paths confirmed to exist on `main` at time of writing (not just in the worktree).

## 3. Design requirement — unified standard (not per-site, not optional)

Per Step 1 human decision: the four rendered changes QA flagged in Phase 6 become the **mandatory
baseline** for every `PlatformModal` consumer, applied uniformly across all 11 sites — not a
per-site opt-in and not left to individual dev judgement:

1. `role="dialog"` + `aria-modal="true"` on the dialog container (already present in `910b70c`'s
   `PlatformModal` — verify it survives whatever API changes Step 6 makes).
2. A visible close (X) button in the header, ≥ 44×44px tap target, `aria-label="Close modal"` or
   equivalent.
3. Dialog title renders as `<h2>`, not `<h3>` — sites currently rendering a different heading level
   converge on `<h2>`.
4. Dialog title typography converges on one token-based style (the StoragePage restyle becomes the
   standard, not the exception) — no raw hex, no per-site font override once migrated.

**Open design question — flag to `@uiux-agent`, do not resolve in this task list:** `ClinicGrooming.tsx`
(#6) and `UserManagementTab`'s main edit `Modal` (out of scope, reference only) share a
sticky-header/sticky-footer long-form layout that `PlatformModal`'s current whole-panel-scrolls
structure breaks (action buttons can scroll out of view). `@uiux-agent` must decide, at Step 6, either:
(a) a structural `PlatformModal` variant/prop that supports a pinned footer, or (b) that
`ClinicGrooming.tsx` stays on bespoke markup with a recorded reason. **PM does not pre-decide this** —
it blocks Task MODAL-7 until resolved.

**Note for Step 3.4 (not a decision, just a flag):** `PlatformModal.tsx`'s prop contract is shared by
11 call sites — none of the individual site changes fits the arch-agent trigger list in CLAUDE.md
(no table, no service, no integration, no state machine, no transaction, not authz/audit/quota/
tenancy), so a literal reading says "skip." But the blast radius (one component, 11+ consumers, a
structural variant needed for #6) is exactly the kind of shared-contract risk Step 3.4 exists to catch
before Step 6 parallelizes. Recommend `@ba-agent` decide arch tier (`brief` vs `skipped`) explicitly
at Step 3 rather than defaulting silently — flagging, not deciding.

---

## 4. Tasks

```
Task ID: MODAL-1
Actor/role: n/a (internal design deliverable, all roles are downstream consumers)
Device: Both
Description: Design the unified PlatformModal visual/a11y standard — final prop contract,
  header/title/close-button spec, heading level, typography token, and the sticky-footer resolution
  for #6 (ClinicGrooming) and UserManagementTab's main edit Modal. Owner: @uiux-agent at Step 6,
  informed by anemal-design-system tokens. This gates every other task below.
Acceptance Criteria:
  - [ ] Spec names exact Tailwind/token classes for header, title (<h2>), close button, body, footer
  - [ ] Spec states the final PlatformModal prop names/types (may differ from 910b70c's shape)
  - [ ] Sticky-footer question (ClinicGrooming + UserManagementTab main edit) explicitly resolved with
        a stated reason, not left implicit
  - [ ] Spec confirms role="dialog", aria-modal="true", 44x44px close target, Escape-to-close as
        mandatory baseline for every consumer
  - [ ] Spec reviewed against anemal-design-system token table — zero raw hex
Permission(s): n/a (design artifact, no runtime permission)
Dependencies: none — first task
```

```
Task ID: MODAL-2
Actor/role: clinic_admin
Device: Web
Description: Migrate AdminBranches.tsx's BranchForm modal onto the MODAL-1 standard.
Acceptance Criteria:
  - [ ] BranchForm renders through the finalized PlatformModal contract (MODAL-1)
  - [ ] Open triggers: "New Branch" button and row-edit action both still open the form
  - [ ] Existing characterization tests (01b8348 reference) re-run and updated to the new DOM shape,
        not silently deleted
  - [ ] clinic_admin without clinic.branch.view (or a lower role) never reaches this screen — route
        guard unchanged, verified by existing route test, not a new one
  - [ ] Cancel / backdrop click / Escape all close the form without persisting a half-filled branch
  - [ ] Save persists and closes; validation errors keep the modal open
Permission(s): clinic.branch.view (screen), clinic.branch.edit (save, if distinct — confirm against
  anemal-rbac-matrix)
Dependencies: MODAL-1
```

```
Task ID: MODAL-3
Actor/role: clinic_admin
Device: Web
Description: Migrate UserManagementTab.tsx's DeactivateConfirmDialog onto the MODAL-1 standard. The
  main edit Modal in this file is explicitly OUT of scope (sticky-footer conflict) — do not touch it
  in this task.
Acceptance Criteria:
  - [ ] DeactivateConfirmDialog renders through PlatformModal with a real visible <h2> heading (the
        prior screen-reader-only aria-label-with-no-heading pattern is replaced, per Step 1 direction)
  - [ ] closeOnBackdropClick is false (or equivalent) — a destructive confirm must not dismiss via
        accidental backdrop click without an explicit choice
  - [ ] Confirm deactivates the target user; Cancel/close leaves the user active, unchanged
  - [ ] A user whose role lacks staff.view cannot reach this screen (existing route guard, verified)
  - [ ] The untouched main edit Modal has zero diff in this PR — grep/diff check in the task's own
        verification step
Permission(s): staff.view (screen), staff manage-level permission for the deactivate action itself
  (confirm exact code against anemal-rbac-matrix)
Dependencies: MODAL-1
```

```
Task ID: MODAL-4
Actor/role: clinic_staff (view/manage), doctor (view)
Device: Both
Description: Migrate ClinicAppointments.tsx's AppointmentDetail modal onto the MODAL-1 standard.
Acceptance Criteria:
  - [ ] AppointmentDetail renders through PlatformModal, opens from calendar/list row click
  - [ ] All existing detail actions (edit, cancel, status change — enumerate at implementation time
        against current file) remain reachable and functional post-migration
  - [ ] A role without appointments.view cannot reach the screen (existing guard, verified)
  - [ ] Tablet viewport (768px portrait, 1024px landscape) keeps all action buttons within the visible
        modal area — no clipped footer
  - [ ] Modal state does not leak appointment data from a different tenant (existing query already
        tenant-scoped — verify no new query was introduced by the migration itself)
Permission(s): appointments.view (screen); appointments.edit or equivalent for in-modal actions
Dependencies: MODAL-1
```

```
Task ID: MODAL-5
Actor/role: clinic_admin
Device: Web
Description: Migrate StoragePage.tsx's storage-switch confirm modal onto the MODAL-1 standard. Note:
  this site is the SOURCE of the title-restyle change that Step 1 approved as the new universal
  standard — verify the other 10 sites converge to match StoragePage's title style, not the reverse.
Acceptance Criteria:
  - [ ] Storage-switch confirm renders through PlatformModal; title styling matches the MODAL-1 token
        spec exactly (same classes as every other migrated site)
  - [ ] Confirm switches the active storage provider; Cancel/backdrop/Escape leaves it unchanged
  - [ ] A role without clinic.integrations.edit cannot reach the screen (existing guard, verified)
  - [ ] Existing StoragePage tests updated to the new DOM shape, not deleted
Permission(s): clinic.integrations.edit
Dependencies: MODAL-1
```

```
Task ID: MODAL-6
Actor/role: clinic_admin
Device: Web
Description: Migrate RoleList.tsx's DeleteDialog onto the MODAL-1 standard.
Acceptance Criteria:
  - [ ] DeleteDialog renders through PlatformModal
  - [ ] The "Cannot Delete Role" in-use case still surfaces its error message + icon in the body (per
        910b70c's disclosed note #3 — the title-bar red color/icon is dropped, the body error message
        is not); confirm this matches the MODAL-1 spec's final decision, not assumed
  - [ ] Confirm deletes an unused role; a role currently assigned to a user cannot be deleted and shows
        the in-body error instead
  - [ ] A user without roles.edit cannot trigger delete (button hidden or disabled, verified)
  - [ ] closeOnBackdropClick behavior matches MODAL-1 spec for destructive confirms
Permission(s): roles.view (screen), roles.edit (delete action)
Dependencies: MODAL-1
```

```
Task ID: MODAL-7
Actor/role: clinic_staff
Device: Tablet
Description: Migrate ClinicGrooming.tsx's grooming modal onto the MODAL-1 standard, applying whatever
  sticky-footer resolution MODAL-1 specified. BLOCKED until MODAL-1's sticky-footer question is
  resolved — do not start implementation against an assumed answer.
Acceptance Criteria:
  - [ ] Grooming modal renders through PlatformModal (or its approved sticky-footer variant) per the
        MODAL-1 resolution
  - [ ] Action buttons remain visible/reachable at 768px portrait without requiring the user to scroll
        the whole panel to find Save/Cancel
  - [ ] Zero test coverage today (confirmed) — this task adds first coverage: open/close, save,
        cancel, backdrop, Escape, at minimum
  - [ ] A role without grooming.view cannot reach the screen; doctor role specifically excluded per
        existing route comment ("Doctor has no grooming access") — verify this still holds post-migration
  - [ ] No tenant/branch data leakage introduced by the migration (existing queries unchanged)
Permission(s): grooming.view
Dependencies: MODAL-1 (specifically its sticky-footer resolution)
```

```
Task ID: MODAL-8
Actor/role: clinic_admin
Device: Web
Description: Migrate CloneRoleModal.tsx onto the MODAL-1 standard.
Acceptance Criteria:
  - [ ] Clone-role form renders through PlatformModal
  - [ ] Zero test coverage today (confirmed) — this task adds first coverage: open, form submit
        (success + validation-error path), cancel, backdrop, Escape
  - [ ] Cloning produces a new role with the source role's permission set, editable before save
  - [ ] A user without roles.edit cannot reach clone (button hidden/disabled, verified)
Permission(s): roles.view (screen), roles.edit (clone action)
Dependencies: MODAL-1
```

```
Task ID: MODAL-9
Actor/role: doctor, clinic_admin
Device: Both
Description: Migrate AdminBloodBank.tsx's modal(s) onto the MODAL-1 standard.
Acceptance Criteria:
  - [ ] Donor/collection modal(s) render through PlatformModal (enumerate exact modal count at
        implementation time against current file — the reference material did not characterize this
        file's modal shape)
  - [ ] Zero test coverage today (confirmed) — this task adds first coverage: open, submit, cancel,
        backdrop, Escape for each distinct modal in the file
  - [ ] A role without bloodbank.view cannot reach the screen (existing guard, verified)
  - [ ] Donor/collection records stay tenant-scoped — no new cross-tenant query introduced
Permission(s): bloodbank.view (screen); confirm write-permission code against anemal-rbac-matrix
Dependencies: MODAL-1
```

```
Task ID: MODAL-10
Actor/role: clinic_staff
Device: Tablet
Description: Migrate ClinicInventory.tsx's modal(s) onto the MODAL-1 standard.
Acceptance Criteria:
  - [ ] Inventory item modal(s) render through PlatformModal (enumerate exact modal count at
        implementation time)
  - [ ] Zero test coverage today (confirmed) — this task adds first coverage: open, submit
        (stock adjustment / item edit), cancel, backdrop, Escape
  - [ ] A role without inventory.view cannot reach the screen (existing guard, verified)
  - [ ] Stock quantity changes remain branch-scoped (existing behavior, verify unchanged by migration)
Permission(s): inventory.view (screen); confirm write-permission code against anemal-rbac-matrix
Dependencies: MODAL-1
```

```
Task ID: MODAL-11
Actor/role: clinic_staff
Device: Tablet
Description: Migrate BarcodeScanner.tsx's overlay onto the MODAL-1 standard. Flag at implementation:
  a camera-viewfinder overlay may not fit PlatformModal's fixed max-width/padding shell cleanly —
  confirm with @uiux-agent before assuming a straight swap.
Acceptance Criteria:
  - [ ] Scanner overlay renders through PlatformModal (or a recorded, reasoned exception if the
        camera viewfinder genuinely cannot fit the shared shell — same bar as the ClinicGrooming
        sticky-footer exception)
  - [ ] Zero test coverage today (confirmed) — this task adds first coverage: open, close, and a
        mocked successful-scan callback path
  - [ ] Close (X), backdrop, and Escape all stop the camera stream cleanly (no orphaned media stream)
  - [ ] Scanner is reachable only from the clinic_staff-gated screens that currently mount it
        (inventory/billing flows) — no new mount point introduced
Permission(s): inherits the permission of whichever screen mounts it (inventory.view, or billing
  screen's permission — confirm exact call sites at implementation time)
Dependencies: MODAL-1
```

```
Task ID: MODAL-12
Actor/role: all authenticated roles (both planes)
Device: Both
Description: Migrate IdleLogoutModal.tsx onto the MODAL-1 standard. This is the one cross-plane site —
  it must work identically for clinic and platform sessions with no tenant/plane-specific branching
  introduced.
Acceptance Criteria:
  - [ ] Idle-warning modal renders through PlatformModal (or a recorded exception if its
        countdown/auto-logout timer interacts badly with PlatformModal's mount/unmount — flag to
        @uiux-agent rather than guessing)
  - [ ] Zero test coverage today (confirmed) — this task adds first coverage: idle warning appears at
        the configured threshold, "stay logged in" resets the timer, timeout logs the user out
  - [ ] Verified for BOTH a clinic-plane session and a platform-plane session — this is the one modal
        that must not silently assume `tenantId` exists
  - [ ] Auto-logout on timeout still clears the session/token correctly post-migration (negative case:
        a stale/expired session must not show a broken or stuck modal)
Permission(s): n/a — fires for any authenticated session regardless of permission set
Dependencies: MODAL-1
```

```
Task ID: MODAL-13
Actor/role: n/a (cross-cutting verification)
Device: Both
Description: Full 11-site consistency + regression pass after MODAL-2..MODAL-12 land. Confirms the
  "unified visual theme, no per-site inconsistency" goal from Step 1 sign-off is actually met, not
  just each site individually migrated.
Acceptance Criteria:
  - [ ] All 11 migrated sites use identical header/title/close-button markup (diff-check, not eyeball)
  - [ ] All 11 sites share the same heading level (<h2>) and title token class
  - [ ] Full frontend suite green (baseline before this branch: 410/410 tests, 60/60 files — record
        the new count, it will grow with MODAL-7/8/9/10/11/12's new coverage)
  - [ ] tsc --noEmit clean
  - [ ] Tablet viewport (768px, 1024px) smoke-checked on every Tablet/Both-device site in the table
  - [ ] Zero raw hex, zero non-token font sizes across all 11 migrated files (design-system conformance)
Permission(s): n/a
Dependencies: MODAL-2, MODAL-3, MODAL-4, MODAL-5, MODAL-6, MODAL-7, MODAL-8, MODAL-9, MODAL-10,
  MODAL-11, MODAL-12
```

---

## 5. Backlog (explicitly deferred, with reason)

| Item | Reason deferred |
|------|------------------|
| `ClinicPets.tsx`, `ClinicBilling.tsx`, `ClinicInpatient.tsx` modals | Phase 7 god-components — need characterization tests + structural decomposition first; migrating their modals now would be redone/wasted work. Not part of this branch. |
| Focus-trap / focus-on-open for PlatformModal | Not one of the four changes Step 1 approved as the new standard. Size and schedule separately with `@ba-agent`. |
| `UserManagementTab.tsx`'s main edit `Modal` | Same sticky-footer structural conflict as `ClinicGrooming.tsx`, but Step 1 sign-off explicitly left it out of this consolidation's scope (only `DeactivateConfirmDialog` is in). Revisit alongside a future `PlatformModal` sticky-footer variant if one gets built for MODAL-7. |

---

## 6. Open questions for Step 3 (`@ba-agent`)

1. Confirm exact write-permission codes for MODAL-2 (branch edit), MODAL-6/MODAL-8 (role delete/clone),
   MODAL-9 (blood bank write), MODAL-10 (inventory write), MODAL-11 (scanner mount points) against the
   canonical `anemal-rbac-matrix` catalogue — this task list used the *view* permission from live routes
   but several actions are writes and the exact write-permission code needs BA confirmation.
2. Decide arch tier for MODAL-1's PlatformModal contract change (see §3 note) — `brief` or
   `skipped (below threshold)`.
3. Confirm doctor's exact access level on MODAL-9 (AdminBloodBank) — table lists doctor as an actor
   based on clinical relevance, but the route only gates on `bloodbank.view`; BA should confirm this
   against the RBAC matrix rather than PM inferring it from route names.
