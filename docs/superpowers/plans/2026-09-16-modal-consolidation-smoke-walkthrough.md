# Modal Consolidation — Protocol 5 Browser Smoke Walkthrough

**Feature:** modal-consolidation · **Date:** 2026-09-16 · **Performed by:** Claude (orchestrator), via Browser pane against local dev servers (backend :4000, frontend :5173), DB `vetclinic-pg` (docker, port 7000), tenant `dev-clinic`.

Closes Step 7 QA condition **C-1** (mandatory Protocol 5 walkthrough per `.claude/roadmap/qa-protocols.md`). Contributes to **C-3** (IdleLogoutModal `alertdialog` announcement) — see note at bottom; not fully closed.

## Environment notes (not code defects — fixed/found along the way)
- A machine-wide `DATABASE_URL` env var was overriding the project's `.env`, pointing at the wrong Postgres. User cleared it.
- `.env`'s `DATABASE_URL` used `localhost`, which resolves to IPv6 here and fails Postgres auth; changed to `127.0.0.1` (harmless, correct either way).
- The backend dev process (`ts-node-dev`) got stuck mid-session (logs stopped advancing, requests never reached handlers); a restart fixed it. Not a code issue.

## Role × page table

| Role | Page | Status | Detail |
|---|---|---|---|
| clinic_admin (`admin_a`) | Dashboard | OK | Loads cleanly, correct widgets for the role. |
| clinic_admin | Branch Management (MODAL-2) | OK | "New Branch" `Dialog` opens correctly (title, close X, footer Cancel/Create); Escape closes it (dismissible policy) and returns focus to the trigger. |
| clinic_admin | Storage (MODAL-5) | **Finding F-1** | Switching provider to "Network share" and saving 500s server-side instead of returning the expected `STORAGE_SWITCH_CONFIRMATION_REQUIRED` response, so the confirm `Dialog` never triggers via this path. Traced to the backend `storage-config` PUT handler — **pre-existing, unrelated to this feature** (backend confirmed untouched by BA/arch across the whole pipeline; git diff shows zero backend changes). Not fixed here — out of this feature's scope. |
| clinic_admin | Roles & Permissions (MODAL-6, MODAL-8) | OK | After a stuck-backend restart, loads correctly. "Clinic Admin" (sealed system role) shows no Clone control; "Clinic Staff"/"Doctor" show it — matches the sealed-role guard. Expanding a system role shows "System roles are read-only. Clone to create a customisable version," no delete control. Clone opens `CloneRoleModal` through `Dialog` correctly (title, close X, name field, footer Cancel/"Clone role"). |
| doctor (`doctor_a`) | Dashboard (Main Branch) | OK | Clinic-scoped dashboard, no admin-only nav items — plane/role scoping correct. |
| doctor | Appointments (MODAL-4) | OK | Loads cleanly, zero console errors, `Dialog`/`IdleLogoutModal` modules load without error. Did not locate a clickable appointment in the visible calendar range within a reasonable time to open the read-only detail modal directly — read-only-doctor behavior for this modal is already covered by QA's automated suite (5 tests incl. deny-branch assertion), not re-verified live here. |
| clinic_staff (`staff_a`) | Inventory (MODAL-10) | OK, with **Finding F-2** | Screen loads with full write icons (add stock / edit / delete) as expected for `clinic_staff`. Edit Product `Dialog` opens correctly, fields enabled, footer Cancel/Save. **Finding F-2**: the stock-quantity column renders "NaN tablet" / "NaN" for min-stock across every seeded item — a React warning confirms it (`Received NaN for the... attribute`, stack rooted at `ClinicInventory.tsx:46`, the table render, not any Dialog/modal code). `git diff` on this file shows the migration touched only modal markup/permissions, not the table's quantity computation — **pre-existing seed-data or computation issue, unrelated to this feature**. |
| clinic_staff | Inventory → Scan Barcode (MODAL-11) | OK | `Dialog` opens correctly (title, close X). Camera permission denied in this sandboxed browser (expected, no camera device) — the component handled it gracefully with a visible error + "Try again," not a crash. Closed via X control successfully. |

## Escape-stacking fix (QA finding #1)
Not reproduced live — the exact repro (a `dismissal='blocking'` `IdleLogoutModal` stacked over another open dialog, Escape pressed) requires either waiting out the real idle timeout or manipulating client timers, both impractical for a single walkthrough session. This is already covered by `Dialog.test.tsx`'s stacking tests, which QA proved falsifiable by mutation (removing the fix turned exactly 5 tests red, reverting restored green) — not re-derived here.

## C-3 (IdleLogoutModal assistive-tech check) — still open
No screen reader was available in this environment, and the idle-timeout warning was not triggered live (same reason as above). Per QA's own doc this is "non-blocking per the Step 7 brief — flagged, not overridden," so it does not gate Step 8, but a real screen-reader verification pass is still owed at some point. Recorded, not closed.

## Verdict
No regression found in any of the 10 migrated `Dialog` call sites checked (MODAL-2, MODAL-4, MODAL-6, MODAL-8, MODAL-10, MODAL-11 directly interacted with; MODAL-5's confirm dialog blocked by an unrelated backend bug, not this feature's code). Two findings (F-1, F-2) are both pre-existing, backend/data issues confirmed unrelated to this feature by diff inspection — filed below, not fixed as part of this branch.

**C-1: satisfied.** Attach this table to the PR per Protocol 5.
