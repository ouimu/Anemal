# Modal Consolidation — Implementation Plan + Work-Partition Manifest (Step 4)

**Feature:** modal-consolidation · **Lane:** A · **Step:** 4 (`/superpowers:write-plan`)
**Author:** @pm-agent · **Date:** 2026-09-11
**Upstream (all closed):**
- Step 1 `/superpowers:brainstorm` — human sign-off
- Step 2 `docs/superpowers/plans/2026-09-11-modal-consolidation-pm-tasks.md` (@pm-agent, this agent's own prior output — superseded in the places listed below)
- Step 3 `docs/superpowers/plans/2026-09-11-modal-consolidation-ba-signoff.md` (@ba-agent, SIGN-OFF GIVEN — CONDITIONAL, §6 corrections applied below)
- Step 3.4 `docs/superpowers/plans/2026-09-11-modal-consolidation-arch-brief.md` (@arch-agent, tier **brief**, status **FINAL**)
- Step 3.4b ponytail arch-precheck — FLAG on the 3-branch props union, resolved (collapsed to 2 branches)
- Step 3.5 `/grill-with-docs` — human decisions D-1 (Option B), D-4 (rename now) — both closed
- `docs/adr/0027-shared-modal-dismissal-policy-and-plane-neutrality.md` (Accepted) — durable record of D-1/D-4/Ponytail outcomes

**Downstream:** Step 4b (@scribe-agent reference pre-check) → Step 5 (@ponytail-agent full gate, arch doc + this plan together) → Step 6 (`/superpowers:execute-plan`).

**arch:** brief tier, not skipped. Class/interface names below (`Dialog`, `DialogProps`, `DismissalPolicy`) are frozen at `docs/superpowers/plans/2026-09-11-modal-consolidation-arch-brief.md` §4 — this plan does not invent new names, props, or behaviour; it sequences and assigns file ownership for what arch already froze.

---

## 0. What changed since Step 2 (applied throughout, not re-derived)

Per the orchestrator's Step 4 brief and the source documents read above:

1. **Component renamed and moved.** `PlatformModal` (`components/platform/PlatformModal.tsx`) → **`Dialog`** (`components/Dialog.tsx`), exporting `Dialog`, `DialogProps`, `DismissalPolicy`. Every task below references `Dialog`, not `PlatformModal` — the sweep the orchestrator asked for is applied to MODAL-1 through MODAL-13 (originally ~20 references across MODAL-1/2/3/5/6 and others per the arch brief's count).
2. **Prop contract is final — two branches, three policy values.** `DismissalPolicy = 'dismissible' | 'explicit' | 'blocking'`; `DialogProps` is a two-branch union (`onClose` required under `'dismissible'`/`'explicit'`, optional-and-unused under `'blocking'`). No `onClose?: never` guard — removed per the Step 3.4b ponytail flag; the real risk (`dismissal='dismissible'` landing on `IdleLogoutModal`) is caught by a behavioural test, not a type.
3. **Permission codes corrected** per BA §6 — applied verbatim in each task below, replacing the four codes the PM's Step 2 doc invented (`clinic.branch.edit`, `roles.edit`, `staff.edit`, `bloodbank.create/edit`, `inventory.manage` — none exist in the catalogue).
4. **MODAL-12 (`IdleLogoutModal`) is IN SCOPE.** D-1 resolved to **Option B**: it migrates onto `Dialog` under `dismissal='blocking'`, not carved out.
5. **Task count: 14.** `MODAL-0` (Dialog rename, new, sequenced first) + `MODAL-1` … `MODAL-13`.
6. **Sequencing changes:** `MODAL-0` before `MODAL-1`; `MODAL-1` before every consumer migration; `MODAL-13` after `MODAL-2…MODAL-10,12` (**not** after `MODAL-11`); `MODAL-11` **last**, after `MODAL-13` (D-3).

### 0.1 A discrepancy this plan resolves against the primary source, not the summary

The orchestrator's brief states MODAL-12 keeps "Escape still works (safe default)" under `dismissal='blocking'`. The frozen contract I read directly — arch brief §4 table and ADR-0027 decision 1 — states the opposite and argues it at length: under `'blocking'`, **Escape is a no-op**, not a close. Quote from ADR-0027: *"`'blocking'` is the only state that departs from APG's 'Escape closes the dialog', and `alertdialog` + a required response is precisely the case APG carves out for it."* The arch brief's derived-behaviour table (§4) lists `'blocking'` → Escape: `no-op`, matching the ADR, and the frozen blocking-policy test (§7, ADR-0027 *Testing constraint* #1) asserts `IdleLogoutModal` "does not close on Escape or on backdrop click."

Per CLAUDE.md Step 4 instruction to reference the arch doc's frozen names/behaviour rather than invent or re-summarize, **this plan follows the arch brief and ADR-0027 verbatim: Escape is a no-op under `'blocking'`.** MODAL-12 below is written accordingly. **Flagged explicitly for Step 5 scrutiny** — see §6.

---

## 1. Scope (unchanged from Step 2/3, restated for completeness)

**In scope:** 11 consumer migrations (MODAL-2…MODAL-12) + the shared component itself (MODAL-0, MODAL-1) + the cross-cutting verification (MODAL-13). No backend, database, route, or permission-code change anywhere in this feature — confirmed twice, by BA §7 and arch brief §3/§6.

**Out of scope (backlog, unchanged):**
| Item | Reason |
|---|---|
| `ClinicPets.tsx`, `ClinicBilling.tsx`, `ClinicInpatient.tsx` modals (14 hand-rolled roots) | Phase 7 god-components — need characterization tests + decomposition first |
| Focus-trap / focus-on-open for `Dialog` | Not one of the Step 1 four mandated changes; size separately |
| `UserManagementTab.tsx:100` (main edit modal) | Sticky-footer/local-`Modal` conflict; explicitly excluded by Step 1 sign-off |
| `UserManagementTab.tsx:144` (self-demotion confirm) | **Working assumption: out**, per BA recommendation (§5.6) and the arch brief's day-one allowlist, which is written for this outcome. **This is D-2, and it was not on the arch brief's list of decisions closed at Step 3.5** (only D-1, D-4, and the ponytail flag were closed — see arch brief §10). Carried as an assumption, not a closed decision — flagged in §6 below. |
| Lane B bug — legacy `role`-string gates in `AdminLayout.tsx:36` / `ClinicLayout.tsx:31` | Pre-existing, unrelated to modals (BA F-3); file separately |
| `anemal-rbac-matrix` doc fix (`rbac.routes` → `role.routes.ts`) | Doc drift, not code; @scribe-agent, Step 8 |

**Data model / DB / backend impact: none.** `@db-agent` has no review surface. See §5 (Work-Partition Manifest, W0).

---

## 2. Tasks

```
Task ID: MODAL-0
Actor/role: n/a (internal, pure move — no behaviour change)
Device: Both
Description: Rename and relocate the shared dialog component before any migration begins, while the
  blast radius is smallest (4 files, 5 call sites today vs 15 files/16 call sites after the fan-out —
  arch brief §4, ADR-0027 decision 2). Move src/frontend/src/components/platform/PlatformModal.tsx to
  src/frontend/src/components/Dialog.tsx. Default export PlatformModal -> Dialog. Update the 5 existing
  platform-plane call sites' imports: components/platform/ClinicAdminsTab.tsx (x3),
  views/platform/CustomerListView.tsx (x1), views/platform/PlatformPlansView.tsx (x1). Root of
  components/, not a new components/shared/ (repo convention: MaterialIcon, Toggle, Can,
  BranchSwitcher, IdleLogoutModal already live there — ADR-0027 decision 2). Zero prop, behaviour, or
  markup change in this task — that is MODAL-1.
Acceptance Criteria:
  - [ ] File exists at src/frontend/src/components/Dialog.tsx; nothing remains at
        components/platform/PlatformModal.tsx
  - [ ] Default export is `Dialog`; no other identifier renamed, no prop/behaviour/markup diff (git
        diff shows only the move + import-path/identifier rename, verified by reviewer)
  - [ ] The 5 platform-plane call sites (ClinicAdminsTab.tsx x3, CustomerListView.tsx x1,
        PlatformPlansView.tsx x1) import from the new path and render identically to before the move
  - [ ] No `Dialog` identifier existed anywhere in src/frontend/src prior to this task (verified — the
        arch brief's census found none); no naming collision introduced
  - [ ] tsc --noEmit clean; full frontend suite green at the pre-branch baseline count
Permission(s): n/a
Dependencies: none — first task
```

```
Task ID: MODAL-1
Actor/role: n/a (internal design + implementation deliverable, all roles are downstream consumers)
Device: Both
Description: Implement the arch-frozen Dialog contract into components/Dialog.tsx (arch brief §4,
  ADR-0027 decisions 1-3) and land its test suite. This is implementation of an already-frozen
  contract, not a new design pass — MODAL-1 does not reopen the dismissal-policy, sticky-footer, or
  plane-neutrality questions; those are closed. What remains for this task: (a) UIUX A finalizes the
  exact Tailwind/token classes for header/title/close-button/body/footer against anemal-design-system
  (a design-spec deliverable that feeds Dev A's implementation — see §5 manifest for the file-ownership
  split), (b) Dev A implements the DialogProps union, the dismissal-derived role/close/Escape/backdrop
  table, the flex-column structural contract (header shrink-0, body flex-1/overflow-y-auto/min-h-0,
  footer shrink-0 — footer slot dissolves the #6 ClinicGrooming sticky-footer question, no variant
  needed), accessible naming (role+aria-modal move to the panel, aria-labelledby -> useId()-generated
  heading id, aria-label removed), unmount-on-close (not CSS-hide), and the plane-neutrality import
  allowlist (react, MaterialIcon only).
Acceptance Criteria:
  - [ ] DialogProps matches arch brief §4 exactly: DismissalPolicy = 'dismissible' | 'explicit' |
        'blocking'; two-branch union; onClose required under 'dismissible'/'explicit', optional and
        never invoked under 'blocking'
  - [ ] Derived-behaviour table implemented exactly as frozen: 'dismissible' -> role=dialog, close X
        rendered, Escape closes, backdrop closes; 'explicit' -> role=dialog, close X rendered, Escape
        closes, backdrop no-op; 'blocking' -> role=alertdialog, no close X, Escape no-op, backdrop
        no-op (see §0.1 — Escape is a no-op under 'blocking', not a close)
  - [ ] role="dialog"/"alertdialog" and aria-modal="true" sit on the panel, not the backdrop overlay
        (fixes the F-9 regression: on main these sit on the click-to-close backdrop div)
  - [ ] Accessible name via aria-labelledby pointing at the <h2> id (React 18 useId()); no aria-label
  - [ ] Heading renders as <h2>, token-based typography per UIUX A's spec, zero raw hex
  - [ ] Close (X) control (when rendered): >= 44x44px target, accessible name, matches UIUX A's spec
  - [ ] footer prop: absent -> no footer element rendered; present -> renders outside the scrolling
        body (structural contract, arch brief §4)
  - [ ] open=false unmounts children (not CSS-hidden) — verified by a probe-child cleanup assertion
  - [ ] src/frontend/src/__tests__/Dialog.test.tsx covers: the dismissal matrix (3 policies x 3
        channels = 9 assertions), the F-9 regression guard (role/aria-modal element != backdrop
        click-handler element), aria-labelledby resolution, heading level, close-target size, the
        unmount probe-child assertion, and the plane-neutrality import-allowlist assertion (module
        imports only react + MaterialIcon; fails if useAuthStore or any tenant/plane import is added)
  - [ ] tsc --noEmit clean; full frontend suite green, new test count recorded
Permission(s): n/a (design/implementation artifact, no runtime permission)
Dependencies: MODAL-0
```

```
Task ID: MODAL-2
Actor/role: clinic_admin
Device: Web
Description: Migrate views/admin/AdminBranches.tsx's BranchForm modal onto Dialog.
Acceptance Criteria:
  - [ ] BranchForm renders through Dialog per the MODAL-1 contract
  - [ ] Open triggers: "New Branch" button and row-edit action both still open the form
  - [ ] Existing characterization tests (01b8348 reference) re-run and updated to the new DOM shape,
        not silently deleted
  - [ ] The route guard RequirePermission perm="clinic.branch.view" is unchanged, AND a role without
        clinic.branch.view receives 403 from the branch API (not: screen-unreachability by legacy
        role string — BA F-3, do not test against AdminLayout's stale role-string gate)
  - [ ] A role holding clinic.branch.view but not clinic.branch.manage can open the form but Save
        returns 403 (server already enforces this; verify the migration introduced no client-side
        bypass)
  - [ ] Cancel / backdrop click / Escape all close the form without persisting a half-filled branch
        (dismissal='dismissible', default)
  - [ ] Save persists and closes; validation errors keep the modal open
Permission(s): clinic.branch.view (screen), clinic.branch.manage (save)
Dependencies: MODAL-1
```

```
Task ID: MODAL-3
Actor/role: clinic_admin
Device: Web
Description: Migrate views/admin/UserManagementTab.tsx's DeactivateConfirmDialog (L253) onto Dialog.
  Two other modal roots in this file are explicitly NOT touched by this task: the main edit modal
  (L100) and the self-demotion confirm (L144) — see §1 for D-2's status. The file also defines a local
  `function Modal(...)` at L36 (the main edit modal's own component) — do not collide with it when
  importing Dialog.
Acceptance Criteria:
  - [ ] DeactivateConfirmDialog renders through Dialog with dismissal='explicit' (destructive confirm
        — Escape still closes per ADR-0027, but backdrop click is a no-op; the prior screen-reader-only
        aria-label-with-no-heading pattern is replaced with a real visible <h2>)
  - [ ] The import of Dialog does not collide with, shadow, or otherwise interact with the file's
        local function Modal(...) at L36 (name-collision check, part of this task's own verification)
  - [ ] Confirm deactivates the target user; Cancel/close leaves the user active, unchanged
  - [ ] The route guard RequirePermission perm="staff.view" is unchanged, AND a role without staff.view
        receives 403 from GET /users (not: screen-unreachability by legacy role string)
  - [ ] A role holding staff.view but not staff.manage can see the deactivate control state consistent
        with server enforcement; the DELETE /users/:id call returns 403 for that role (server already
        enforces; verify no client-side bypass introduced)
  - [ ] The untouched main edit modal (L100) and self-demotion confirm (L144) have zero diff in this
        PR — grep/diff check against the pre-migration file, named explicitly as this task's own
        verification step (not left implicit)
Permission(s): staff.view (screen), staff.manage (DELETE /users/:id — the deactivate action)
Dependencies: MODAL-1
```

```
Task ID: MODAL-4
Actor/role: clinic_staff (view + edit + create), doctor (view only)
Device: Both
Description: Migrate views/clinic/ClinicAppointments.tsx's AppointmentDetail modal onto Dialog. Note:
  ClinicAppointments.tsx:122 is a w-80 side drawer, not a modal — correctly excluded from this task.
Acceptance Criteria:
  - [ ] AppointmentDetail renders through Dialog (dismissal='dismissible', default), opens from
        calendar/list row click
  - [ ] All existing detail actions (edit, cancel, status change — enumerate at implementation time
        against the current file) remain reachable and functional post-migration
  - [ ] The route guard RequirePermission perm="appointments.view" is unchanged, AND a role without
        appointments.view receives 403 from the appointments API (not: screen-unreachability by legacy
        role string)
  - [ ] doctor holds appointments.view only: the detail modal opens read-only for doctor — in-modal
        status-change and booking controls are either hidden/disabled or, if attempted, the underlying
        appointments.edit / appointments.create call returns 403 from the server
  - [ ] Tablet viewport (768px portrait, 1024px landscape) keeps all action buttons within the visible
        modal area — no clipped footer (served by the MODAL-1 footer slot / flex-column structure)
  - [ ] Modal state does not leak appointment data from a different tenant (existing query already
        tenant-scoped — verify no new query was introduced by the migration itself)
Permission(s): appointments.view (screen); appointments.edit (status change); appointments.create (book)
Dependencies: MODAL-1
```

```
Task ID: MODAL-5
Actor/role: clinic_admin
Device: Web
Description: Migrate views/settings/StoragePage.tsx's storage-switch confirm modal onto Dialog. Note:
  this site is the SOURCE of the title-restyle change Step 1 approved as the universal standard —
  verify the other 10 sites converge to match StoragePage's title style, not the reverse (verification
  lives in MODAL-13, not repeated per-task).
Acceptance Criteria:
  - [ ] Storage-switch confirm renders through Dialog with dismissal='explicit' (a confirm dialog with
        a state-changing consequence); title styling matches the MODAL-1 token spec exactly
  - [ ] Confirm switches the active storage provider; Cancel/Escape leaves it unchanged; backdrop click
        is a no-op per the 'explicit' policy
  - [ ] The route guard RequirePermission perm="clinic.integrations.edit" is unchanged, AND a role
        without clinic.integrations.edit receives 403 from the storage-config API (not:
        screen-unreachability by legacy role string). Note: /settings/storage gates its own GET on
        clinic.integrations.edit too — there is no read-only viewer role to test here (pre-existing
        pattern, BA §5.10, not a gap introduced by this migration)
  - [ ] Existing StoragePage tests updated to the new DOM shape, not deleted
Permission(s): clinic.integrations.edit
Dependencies: MODAL-1
```

```
Task ID: MODAL-6
Actor/role: clinic_admin
Device: Web
Description: Migrate components/roles/RoleList.tsx's DeleteDialog onto Dialog.
Acceptance Criteria:
  - [ ] DeleteDialog renders through Dialog with dismissal='explicit' (destructive confirm)
  - [ ] The "Cannot Delete Role" in-use case still surfaces its error message in the body (per main's
        disclosed note — the title-bar red color/icon is dropped per the unified standard, the
        in-body error message is not)
  - [ ] Confirm deletes an unused role; a role currently assigned to a user cannot be deleted and shows
        the in-body error instead
  - [ ] System roles (role.isSystem) expose no delete control at all — regression assertion on the
        existing !role.isSystem && canManage guard (RoleList.tsx L340); a dev restructuring the
        migrated markup must not be able to silently drop this
  - [ ] The route/UI guard for roles.manage is unchanged, AND a user without roles.manage receives 403
        from DELETE /roles/:id if the call is attempted directly (not: screen-unreachability by legacy
        role string)
Permission(s): roles.view (screen — requireAnyPermission(['roles.view','roles.manage'])), roles.manage
  (delete)
Dependencies: MODAL-1
```

```
Task ID: MODAL-7
Actor/role: clinic_staff
Device: Tablet
Description: Migrate views/clinic/ClinicGrooming.tsx's grooming modal onto Dialog. The sticky-footer
  question that blocked this task in the Step 2 draft is DISSOLVED by the arch-frozen footer slot and
  flex-column body-scroll structure (arch brief §4, R6) — this is no longer a variant or an open
  design question. Do not wait for a separate resolution; build against the MODAL-1 contract directly.
Acceptance Criteria:
  - [ ] Grooming modal renders through Dialog using the footer prop for its action row
        (dismissal='dismissible', default)
  - [ ] Action buttons remain visible/reachable at 768px portrait without requiring the user to scroll
        the whole panel to find Save/Cancel (footer is shrink-0, outside the scrolling body)
  - [ ] Zero test coverage today (confirmed) — this task adds first coverage: open/close, save, cancel,
        backdrop, Escape, at minimum
  - [ ] The route guard RequirePermission perm="grooming.view" is unchanged, AND a role without
        grooming.view receives 403 from the grooming API. doctor is confirmed denied grooming.view by
        the RBAC matrix (BA §4, matrix-confirmed, not just a route comment) — verify this still holds
        post-migration
  - [ ] A role holding grooming.view but not grooming.manage can open the modal but write actions
        return 403 (server already enforces; verify no client-side bypass introduced)
  - [ ] No tenant/branch data leakage introduced by the migration (existing queries unchanged)
Permission(s): grooming.view (screen), grooming.manage (write)
Dependencies: MODAL-1
```

```
Task ID: MODAL-8
Actor/role: clinic_admin
Device: Web
Description: Migrate components/roles/CloneRoleModal.tsx onto Dialog.
Acceptance Criteria:
  - [ ] Clone-role form renders through Dialog (dismissal='dismissible', default)
  - [ ] Zero test coverage today (confirmed) — this task adds first coverage: open, form submit
        (success + validation-error path), cancel, backdrop, Escape
  - [ ] Cloning produces a new role with the source role's permission set, editable before save
  - [ ] Clone is offered on system roles only — regression assertion on the existing
        role.isSystem && canManage guard (RoleList.tsx L324); a dev restructuring the migrated markup
        must not silently drop this
  - [ ] clinic_admin (SEALED_ROLE_KEY) cannot be cloned — regression assertion on the existing sealed
        check (useUserRoles.ts / RoleList.tsx L50-52)
  - [ ] The cloned role's permission set, once created, remains a subset of the caller's own effective
        permissions (no-escalation invariant, anemal-rbac-matrix custom-role safety rule) — this is a
        privilege-escalation guard, treat as high-severity if it regresses
  - [ ] The route/UI guard for roles.manage is unchanged, AND a user without roles.manage receives 403
        from the clone endpoint if attempted directly (not: screen-unreachability by legacy role
        string)
Permission(s): roles.view (screen), roles.manage (clone)
Dependencies: MODAL-1
```

```
Task ID: MODAL-9
Actor/role: doctor (full access), clinic_admin (full access), clinic_staff (view only)
Device: Both
Description: Migrate views/admin/AdminBloodBank.tsx's modal(s) onto Dialog. This file also defines a
  local `function Modal(...)` at L60 — this migration removes that local definition (unlike
  UserManagementTab, there is no out-of-scope consumer of it to preserve).
Acceptance Criteria:
  - [ ] Donor/collection modal(s) render through Dialog (enumerate exact modal count at implementation
        time against the current file — dismissal policy per-modal: 'explicit' for any modal recording
        a collection/transfusion match, 'dismissible' for view-only detail — confirm at implementation)
  - [ ] The file's local function Modal(...) (L60) is removed as part of this migration; no aliased or
        duplicate identifier remains
  - [ ] Zero test coverage today (confirmed) — this task adds first coverage: open, submit, cancel,
        backdrop, Escape for each distinct modal in the file
  - [ ] The route guard RequirePermission perm="bloodbank.view" is unchanged, AND a role without
        bloodbank.view receives 403 from the blood-bank API (not: screen-unreachability by legacy role
        string — BA F-3: doctor's inability to reach this screen today is a pre-existing UI-layout
        defect unrelated to authorization, out of scope here; do NOT write an AC claiming doctor cannot
        reach the screen)
  - [ ] clinic_staff is a third actor on this screen, view-only: the screen opens for clinic_staff
        (holds bloodbank.view) but any write modal must not submit — the underlying
        POST /blood-bank/... call returns 403 (server already enforces bloodbank.manage; verify no
        client-side bypass)
  - [ ] Donor/collection records stay tenant-scoped — no new cross-tenant query introduced
Permission(s): bloodbank.view (screen); bloodbank.manage (donor/collection/transfusion writes)
Dependencies: MODAL-1
```

```
Task ID: MODAL-10
Actor/role: clinic_staff (view + write), doctor (view only)
Device: Tablet
Description: Migrate views/clinic/ClinicInventory.tsx's modal(s) onto Dialog.
Acceptance Criteria:
  - [ ] Inventory item modal(s) render through Dialog (enumerate exact modal count at implementation
        time); map each modal to its exact write permission — stock-in/adjustment modal is gated
        inventory.adjust, item-edit modal is gated inventory.edit (these are distinct codes, do not
        conflate)
  - [ ] Zero test coverage today (confirmed) — this task adds first coverage: open, submit (stock
        adjustment / item edit), cancel, backdrop, Escape
  - [ ] The route guard RequirePermission perm="inventory.view" is unchanged, AND a role without
        inventory.view receives 403 from the inventory API (not: screen-unreachability by legacy role
        string)
  - [ ] doctor holds inventory.view only: doctor can open item modals read-only, but neither the
        stock-adjustment nor the item-edit write path submits — the underlying inventory.adjust /
        inventory.edit call returns 403
  - [ ] Stock quantity changes remain branch-scoped (existing behavior, verify unchanged by migration)
Permission(s): inventory.view (screen); inventory.create / inventory.edit / inventory.adjust (per-modal,
  mapped at implementation)
Dependencies: MODAL-1
```

```
Task ID: MODAL-11
Actor/role: clinic_staff
Device: Tablet
Description: Migrate components/BarcodeScanner/BarcodeScanner.tsx's overlay onto Dialog. RESEQUENCED
  TO LAST per human decision D-3 — this task starts only after MODAL-13 completes, not in the MODAL-2
  fan-out wave. Confirmed: BarcodeScanner has exactly one mount point in the entire frontend
  (views/clinic/ClinicInventory.tsx) — there is no billing mount (BA §4 Q1 correction). Confirmed:
  BarcodeScanner already meets role="dialog", aria-modal, aria-label and a close button today — the
  near-zero-benefit, real-risk profile the BA flagged (F-5) still applies; a camera viewfinder inside
  Dialog's max-w-lg/p-md shell and MediaStream cleanup on unmount are the two things to verify
  carefully, not assume.
Acceptance Criteria:
  - [ ] Scanner overlay renders through Dialog with dismissal='dismissible' (default) OR a recorded,
        reasoned exception per the arch brief §9 format if the camera viewfinder genuinely cannot fit
        the shared shell cleanly — same bar as any other exception, no special-casing
  - [ ] If migrated: no orphaned MediaStream after any close path (close X, backdrop, Escape,
        unmount) — explicit assertion, not inferred from "it used to work"
  - [ ] If exempted: the exception is recorded (arch brief §9 format: Site / Reason / Costs / Revisit)
        and BarcodeScanner.tsx is added to KNOWN_BESPOKE_MODALS in modal-consistency.test.ts with that
        reason string
  - [ ] Zero test coverage today (confirmed) — this task adds first coverage: open, close, and a
        mocked successful-scan callback path
  - [ ] Scanner is reachable only from ClinicInventory.tsx, gated inventory.view — no new mount point
        introduced. The route guard is unchanged, AND a role without inventory.view receives 403 from
        the inventory API
  - [ ] If migrated, the transitional MODAL-13 allowlist entry for BarcodeScanner.tsx (see MODAL-13's
        own AC on this) is removed as part of this task's own diff
Permission(s): inventory.view (inherits from ClinicInventory.tsx, its sole mount point)
Dependencies: MODAL-13
```

```
Task ID: MODAL-12
Actor/role: all authenticated roles (both planes)
Device: Both
Description: Migrate components/IdleLogoutModal.tsx onto Dialog under dismissal='blocking'. D-1
  resolved to Option B at Step 3.5: IdleLogoutModal is NOT carved out of the standard; it migrates
  under the deny-by-default blocking policy. Per the frozen contract (arch brief §4, ADR-0027
  decision 1 — see §0.1 above): role becomes alertdialog (derived, not passed), no close control is
  rendered, Escape is a no-op, backdrop click is a no-op, onClose is optional and never invoked. The
  existing aria-live="assertive" is deliberately NOT carried forward — role="alertdialog" on mount is
  the reliable announcement mechanism; a live region created simultaneously with its content is not,
  and a per-second countdown announced via aria-live would be hostile to screen-reader users. This is a
  recorded, deliberate behaviour change verified by @qa-agent with assistive technology, not asserted
  automatically.
Acceptance Criteria:
  - [ ] Idle-warning modal renders through Dialog with dismissal='blocking': role="alertdialog", no
        close (X) control, Escape does not close it, backdrop click does not close it — the only exit
        is the "Stay logged in" action
  - [ ] Blocking-policy assertion, paired (ADR-0027 Testing constraint, replaces the removed
        onClose?: never type guard):
        (1) IdleLogoutModal renders role="alertdialog", exposes no close control, and does not close
            on Escape or backdrop click — fails if anyone makes the session warning dismissible
        (2) dismissal='blocking' occurs at exactly ONE call site under src/frontend/src/** and that
            site is IdleLogoutModal.tsx — fails if a second site adopts the policy without a decision
  - [ ] aria-live="assertive" is confirmed removed from the migrated component; @qa-agent performs a
        manual assistive-technology check that the alertdialog role still announces on mount (not an
        automated assertion — noted explicitly as a manual QA step, not silently dropped)
  - [ ] Zero test coverage today (confirmed) — this task adds first coverage: idle warning appears at
        the configured threshold, "Stay logged in" resets the timer, timeout logs the user out
  - [ ] Verified for BOTH a clinic-plane session and a platform-plane session — this is the one modal
        that must not assume tenantId exists (mounts from guards/RequireAuth.tsx:52 clinic and
        layouts/PlatformLayout.tsx:148 platform)
  - [ ] Auto-logout on timeout still clears the session/token correctly post-migration (negative case:
        a stale/expired session must not show a broken or stuck modal)
Permission(s): n/a — fires for any authenticated session regardless of permission set
Dependencies: MODAL-1
```

```
Task ID: MODAL-13
Actor/role: n/a (cross-cutting verification)
Device: Both
Description: Full consistency + regression pass after MODAL-2, MODAL-3, MODAL-4, MODAL-5, MODAL-6,
  MODAL-7, MODAL-8, MODAL-9, MODAL-10, MODAL-12 land (NOT MODAL-11 — resequenced after this task per
  D-3). Confirms the "unified standard, no per-site inconsistency" goal is actually met. Replaces the
  Step 2 draft's "diff-check" AC, which the arch brief identified as unsatisfiable/tautological (BA F-6,
  arch brief §7): once every site renders through one component the diff-check cannot fail, and it
  cannot pass on UserManagementTab.tsx, which by design keeps two non-conforming roots. Per ADR-0026's
  testing constraint, a criterion that cannot fail is treated as absent — replaced below with the
  falsifiable census test.
Acceptance Criteria:
  - [ ] New file src/frontend/src/__tests__/modal-consistency.test.ts: scans src/frontend/src/**/*.tsx
        for a hand-rolled modal-root signature (a fixed inset-0 overlay, or a literal
        role="dialog"/role="alertdialog" outside Dialog itself) and asserts the matching set EQUALS a
        checked-in KNOWN_BESPOKE_MODALS allowlist, keyed by path -> expected root count (never
        file:line), each entry carrying a reason string
  - [ ] Allowlist at this task's execution point (BarcodeScanner has NOT migrated yet — see the
        transitional entry below):
        ClinicBilling.tsx: 5 roots (Phase 7, out of scope)
        ClinicPets.tsx: 5 roots (Phase 7, out of scope)
        ClinicInpatient.tsx: 4 roots (Phase 7, out of scope)
        UserManagementTab.tsx: 2 roots, L100 + L144 (main edit out of scope; self-demotion per
          working-assumption D-2 — see §6, this is not yet a closed human decision)
        BarcodeScanner.tsx: 1 root, TRANSITIONAL entry, reason "pending MODAL-11, resequenced after
          this task per D-3" — this entry is removed (if MODAL-11 migrates) or converted to a permanent
          exception entry with the arch brief §9 format (if MODAL-11 defers) as part of MODAL-11's own
          diff, not this task's. This transitional entry is a plan-level resolution, not something the
          arch brief's own day-one allowlist table anticipated (that table assumes BarcodeScanner is
          already decided by the time this test lands) — flagged to Step 5, see §6
  - [ ] The test fails the moment a further hand-rolled root appears, or a new one lands in an
        already-allowlisted file
  - [ ] The 5 existing platform-plane Dialog usages (ClinicAdminsTab.tsx L82/L123/L294,
        CustomerListView.tsx L130, PlatformPlansView.tsx L292) still render identically and work —
        regression check (structural assertions: opens/closes, <h2> with expected title, close
        control present — not whole-modal snapshots), not a migration (they already conform)
  - [ ] Dialog.tsx imports nothing plane-specific — re-run/re-affirm the plane-neutrality
        import-allowlist assertion introduced in MODAL-1 (react, MaterialIcon only) as part of this
        full-suite pass
  - [ ] Full frontend suite green (baseline before this branch: 410/410 tests, 60/60 files — record the
        new count; it will grow with MODAL-7/8/9/10/12's new coverage plus this task's own tests)
  - [ ] tsc --noEmit clean
  - [ ] Tablet viewport (768px, 1024px) smoke-checked on every Tablet/Both-device site in the site
        table (MODAL-4, MODAL-7, MODAL-9, MODAL-10, MODAL-12)
  - [ ] Zero raw hex, zero non-token font sizes across all migrated files (design-system conformance)
Permission(s): n/a
Dependencies: MODAL-2, MODAL-3, MODAL-4, MODAL-5, MODAL-6, MODAL-7, MODAL-8, MODAL-9, MODAL-10, MODAL-12
```

---

## 3. Sequencing (execution order, not just dependency edges)

```
MODAL-0 (rename, sequential)
   -> MODAL-1 (contract implementation, sequential)
        -> [ MODAL-2, MODAL-3, MODAL-4, MODAL-5, MODAL-6, MODAL-7,
             MODAL-8, MODAL-9, MODAL-10, MODAL-12 ]   (parallel fan-out, W2)
             -> MODAL-13 (consistency + platform regression + census, sequential)
                  -> MODAL-11 (BarcodeScanner, last, sequential — D-3)
```

MODAL-0 and MODAL-1 are both single-owner and sequential by necessity (each edits the one file the
other just touched); they are NOT part of the parallel wave. MODAL-11 is deliberately outside the
MODAL-13 dependency set and runs after it, per the human's D-3 resequencing — not because it is
lower-risk, but because BA F-5 found it to be the highest-risk, lowest-benefit task in the set (already
compliant, camera-viewfinder/MediaStream risk) and best isolated at the tail where a defer decision
costs nothing upstream.

---

## 4. Backlog (unchanged from Step 2/3, restated)

| Item | Reason deferred |
|------|------------------|
| `ClinicPets.tsx`, `ClinicBilling.tsx`, `ClinicInpatient.tsx` modals (14 roots) | Phase 7 god-components — characterization tests + decomposition first |
| Focus-trap / focus-on-open for `Dialog` | Not one of the Step 1 four mandated changes; size separately with @ba-agent |
| `UserManagementTab.tsx` main edit modal (L100) | Sticky-footer/local-`Modal` conflict; excluded by Step 1 sign-off |
| Lane B bug: legacy `role`-string gates (`AdminLayout.tsx:36`, `ClinicLayout.tsx:31`) | Pre-existing, unrelated to modals — BA F-3 |
| `anemal-rbac-matrix` doc fix (`rbac.routes` → `role.routes.ts`) | Doc drift — @scribe-agent, Step 8 |

---

## 5. Work-Partition Manifest (Step 4 — required, parallelism legal per CLAUDE.md)

**@db-agent / W0 is a confirmed no-op.** No table, column, index, migration, query, permission code, or
route is touched anywhere in this feature (BA §7, arch brief §3/§6, restated independently by this
plan). @db-agent's role at Step 6 is to confirm this in ~one line and release the wave immediately —
listed below for completeness per CLAUDE.md's manifest requirement, not because there is DB work.

Parallelism is legal here because @arch-agent froze the full contract at Step 3.4 (arch brief §4,
Status: FINAL) — the CLAUDE.md precondition for Step 6 fan-out.

| Task | Wave | Owner | Files it may write (exclusive) | Depends on | Contract referenced |
|------|------|-------|--------------------------------|------------|----------------------|
| DB confirmation | W0 | DBA | none (read-only confirmation, no file writes) | — | arch brief §3/§6 "no DB surface" |
| MODAL-0 | W1 | Dev A | `components/Dialog.tsx` (new), `components/platform/PlatformModal.tsx` (deleted), `components/platform/ClinicAdminsTab.tsx`, `views/platform/CustomerListView.tsx`, `views/platform/PlatformPlansView.tsx` | W0 released | arch brief §4 module identity table, ADR-0027 decision 2 |
| MODAL-1 (design spec) | W1 | UIUX A | design-spec note (embedded in the PR description / a short `docs/design/dialog-token-spec.md`) — no product-code file, so no collision with Dev A's write below | MODAL-0 | arch brief §4 structural contract; anemal-design-system tokens |
| MODAL-1 (implementation) | W1 | Dev A | `components/Dialog.tsx` (content), `__tests__/Dialog.test.tsx` (new) | MODAL-0, UIUX A's spec | arch brief §4 `DialogProps`/`DismissalPolicy`, §7 test strategy |
| MODAL-2 | W2 | Dev A | `views/admin/AdminBranches.tsx` | MODAL-1 | arch brief §4 |
| MODAL-3 | W2 | Dev B | `views/admin/UserManagementTab.tsx` (DeactivateConfirmDialog only) | MODAL-1 | arch brief §4 |
| MODAL-4 | W2 | Dev A | `views/clinic/ClinicAppointments.tsx` | MODAL-1 | arch brief §4 |
| MODAL-5 | W2 | Dev B | `views/settings/StoragePage.tsx` | MODAL-1 | arch brief §4 |
| MODAL-6 | W2 | Dev A | `components/roles/RoleList.tsx` | MODAL-1 | arch brief §4 |
| MODAL-7 | W2 | Dev B | `views/clinic/ClinicGrooming.tsx` | MODAL-1 | arch brief §4 (footer slot) |
| MODAL-8 | W2 | Dev A | `components/roles/CloneRoleModal.tsx` | MODAL-1 | arch brief §4 |
| MODAL-9 | W2 | Dev B | `views/admin/AdminBloodBank.tsx` | MODAL-1 | arch brief §4 |
| MODAL-10 | W2 | Dev B | `views/clinic/ClinicInventory.tsx` | MODAL-1 | arch brief §4 |
| MODAL-12 | W2 | Dev B | `components/IdleLogoutModal.tsx` | MODAL-1 | arch brief §4, ADR-0027 decision 1 |
| MODAL-13 | W3 | Dev B | `__tests__/modal-consistency.test.ts` (new), regression assertions added to existing/new platform-plane test files | all W2 tasks above | arch brief §7 census test |
| MODAL-11 | W4 | Dev A | `components/BarcodeScanner/BarcodeScanner.tsx`, `__tests__/modal-consistency.test.ts` (allowlist entry removal/update only) | MODAL-13 | arch brief §9 exception format, D-3 |

**File-scope check:** every W2 row touches a distinct file — no two tasks in the same wave write the
same file. MODAL-13 (W3) and MODAL-11 (W4) both may touch `modal-consistency.test.ts`, but never in the
same wave (W3 creates it and writes the transitional entry; W4 removes/converts that one entry after
W3 is done) — sequential, not concurrent, so no collision.

**Load balance:** Dev A — MODAL-0, MODAL-1(impl), MODAL-2, MODAL-4, MODAL-6, MODAL-8, MODAL-11 (7
tasks). Dev B — MODAL-3, MODAL-5, MODAL-7, MODAL-9, MODAL-10, MODAL-12, MODAL-13 (7 tasks). UIUX A —
one design-spec deliverable (MODAL-1's token classes), no further design work required at Step 6 since
the structural contract, dismissal-derived behaviour, and sticky-footer resolution are all already
frozen in the arch brief; available for an optional visual-QA pass alongside MODAL-13 if the orchestrator
wants a second set of eyes, not required by any AC above.

---

## 6. Flags for Step 5 (@ponytail-agent, full gate — arch doc + this plan together)

1. **§0.1 Escape-under-'blocking' discrepancy.** The orchestrator's Step 4 brief described MODAL-12 as
   "Escape still works (safe default)." The frozen arch brief §4 table and ADR-0027 decision 1 state
   Escape is a **no-op** under `dismissal='blocking'`, with a paragraph of stated rationale (APG carve-out
   for `alertdialog`) and a test that asserts exactly this ("does not close on Escape or backdrop
   click"). This plan follows the frozen documents, not the summary. Worth an explicit second look at
   Step 5 given it is a behavioural point that could otherwise ship wrong from a stale paraphrase.
2. **D-2 (`UserManagementTab.tsx:144` self-demotion confirm) is not a closed decision.** Arch brief §10
   lists only D-1, D-4, and the ponytail flag as closed at Step 3.5. D-2 and D-3 are listed separately as
   "still carried, not contract items." This plan proceeds on the BA's recommended assumption (out of
   scope, allowlisted at count 2), matching the arch brief's own day-one allowlist. This is now closed —
   the human confirmed D-2 = out at Step 3.5 grill (recorded in arch brief §10) — so MODAL-13's allowlist
   AC stays at "2 roots" for `UserManagementTab.tsx`. It would only drop to "1 root" if D-2 had come in
   instead; nothing else in this plan moves either way.
3. **MODAL-13's transitional BarcodeScanner allowlist entry is a plan-level construction, not something
   the arch brief's day-one allowlist table anticipated.** The arch brief's §7 table describes the
   "post-migration steady state, which is when the test lands (MODAL-13)" and assumes BarcodeScanner's
   fate is already known by then. The human's D-3 resequencing (MODAL-11 explicitly after MODAL-13) means
   it is not known yet at that point. This plan resolves the gap using the arch brief's own allowlist
   mechanism (a named, reasoned, transitional entry that MODAL-11 itself removes or converts) rather than
   inventing a new mechanism — but it is new sequencing logic this plan adds, and Step 5 should confirm
   it does not violate the "criterion that cannot fail is treated as absent" testing constraint (it does
   not — the entry is temporary and explicitly reasoned, and the test still fails on any other new root).
4. **Two small internal inconsistencies in the arch brief, noted so nobody re-derives them as plan
   errors:** (a) §7's corrections table says the day-one census allowlist is "16 roots in 5 files," while
   §7's own itemized table sums to 16 roots across 4 files (ClinicBilling 5 + ClinicPets 5 +
   ClinicInpatient 4 + UserManagementTab 2). This plan uses the itemized table (4 files) as authoritative.
   (b) The "Dialog, not Modal" callout in §4 labels `AdminBloodBank.tsx:60`'s local `Modal` as
   "(MODAL-10)"; the site inventory consistently identifies AdminBloodBank.tsx as MODAL-9 and
   ClinicInventory.tsx as MODAL-10. This plan uses MODAL-9 for AdminBloodBank throughout. Neither affects
   task content, only a doc cross-reference; flagged for @scribe-agent's reference pre-check (Step 4b)
   rather than corrected in the arch doc itself, since this plan does not own that file.
5. **Work-partition manifest extends CLAUDE.md's W0→W1→W2 template to W0→W1→W2→W3→W4.** This feature's
   real dependency chain (rename → contract → fan-out → consistency → last-mile exception) does not fit
   three waves without either serializing the fan-out or mislabeling a dependency. The extension keeps
   the one-owner-per-file-per-wave rule intact throughout (§5) — flagged so Step 5 evaluates the
   deviation deliberately rather than reading it as drift from the template.

---

## 7. Downstream

**Step 4b (@scribe-agent):** verify every path cited in this plan and in the arch brief/ADR exists on
`main` as stated (file paths, line numbers where cited, the two internal arch-brief inconsistencies in
§6.4 do not need fixing, just should not cause a reference-integrity false-positive).

**Step 5 (@ponytail-agent, full gate):** arch doc + this plan together, 9 criteria. §6 above lists what
this plan believes deserves a specific second look; nothing in §6 is presented as already resolved.

**Step 6 (`/superpowers:execute-plan`):** W0 (DBA no-op) → W1 (MODAL-0 → MODAL-1, Dev A + UIUX A) → W2
(MODAL-2…MODAL-10,12 parallel, Dev A ∥ Dev B) → W3 (MODAL-13, Dev B) → W4 (MODAL-11, Dev A). Integration
checkpoint after every wave per CLAUDE.md.
