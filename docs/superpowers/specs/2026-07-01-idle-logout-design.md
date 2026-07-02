# Idle-timeout auto-logout — design

## Problem

No idle-timeout exists today. JWT TTL is a fixed 8h regardless of activity. Users of any role, on either plane, stay logged in for the full 8h even if the device is left unattended — a risk on shared clinic tablets showing client/pet PII.

## Decisions

| # | Decision | Answer |
|---|---|---|
| 1 | Scope | Applies to all roles, both planes (clinic + platform) |
| 2 | Config owner (clinic) | `clinic_admin` only, via existing `clinic.profile.edit` permission — no new permission needed |
| 3 | Config owner (platform) | Not tenant-configurable — fixed value, see Platform config below |
| 4 | Warning | Modal shown 30s before logout ("session expiring"); any activity or explicit "Stay logged in" cancels it |
| 5 | Enforcement | Client-side only (see [ADR-0001](../../adr/0001-idle-logout-client-side-only.md)) — no server-side token revocation |
| 6 | Default / range (clinic) | 15 min default, 5–120 min admin-configurable range. Kept at 15 despite mid-exam tablet idling, because an unattended tablet showing PII is judged the bigger risk; clinics needing longer can raise it themselves |
| 7 | Activity definition | Only real DOM input resets the timer: `mousedown`, `keydown`, `touchstart`, `scroll`. Background API traffic (polling, auto-refresh, silent token refresh) does NOT count — otherwise polling screens would never idle-logout |
| 8 | Multi-tab | Activity in one tab resets the timer in all same-origin tabs, via a `storage`-event-based sync ping (separate localStorage key, unrelated to the auth token itself). Prevents an idle background tab silently logging out a tab the user is actively using |
| 9 | Throttle | Activity recording (timer reset + cross-tab sync write) is throttled to at most once per second, to avoid excessive writes during continuous scroll |
| 10 | Redirect target | Plane-specific: clinic → `/login?reason=idle`, platform → `/platform/login?reason=idle` (the app has two separate login routes, not one) |
| 11 | Banner | Small inline banner added directly to `LoginView.tsx` and `PlatformLoginView.tsx` when `?reason=idle` is present — no new shared toast system (none exists today) |
| 12 | Stale config in open tabs | Accepted limitation: a tab keeps whatever timeout value it loaded at mount until its next page load/refetch. Matches how every other `tenant_settings` field already behaves — no live-propagation exists anywhere in the app today |
| 13 | Platform default location | `VITE_PLATFORM_IDLE_TIMEOUT_MINUTES` build-time env var (default 30), read via `import.meta.env` in the platform frontend. Not routed through backend `config/env.ts` — that would require a new endpoint just to expose one number, since platform-plane enforcement is client-only (see decision 5) |

## Architecture

**Backend (`@db-agent` + `@dev-agent`):**
- Migration: `tenant_settings.idle_timeout_minutes INT NOT NULL DEFAULT 15 CHECK (BETWEEN 5 AND 120)`.
- `tenant-settings.service.ts` `TenantSettingsInput`: add `idleTimeoutMinutes?: number`.
- `tenant-settings.controller.ts` `updateSettingsSchema`: add `idleTimeoutMinutes: z.number().int().min(5).max(120).optional()`.
- No new endpoint — rides existing `GET/PUT /admin/settings` (`clinic.profile.view` / `clinic.profile.edit`, already view-all for every clinic role, edit-only for admin).

**Frontend (`@dev-agent`):**
- `src/frontend/src/hooks/useIdleLogout.ts` — new hook, `useIdleLogout(timeoutMinutes: number, plane: 'clinic' | 'platform')`:
  - Two `setTimeout`s: warn at `(timeoutMinutes*60 - 30)`s, logout at `timeoutMinutes*60`s.
  - Listens `mousedown`/`keydown`/`touchstart`/`scroll`, throttled to 1/sec.
  - On qualifying activity: reset both timers locally AND write a throttled timestamp to a dedicated `localStorage` key (e.g. `vc_idle_ping`) purely as a cross-tab signal.
  - Listens for the `storage` event on that key from other tabs and resets its own timers accordingly.
  - At warn threshold: exposes `{ warning: true, secondsLeft }` state for the modal.
  - At logout threshold (no activity during the warning window): calls `clearAuth()` (clinic) or platform equivalent, then `window.location.href = '/login?reason=idle'` or `/platform/login?reason=idle'` — matches the existing `refreshPermissions()` 401-handling pattern (full reload, not client-side navigate).
- `IdleLogoutModal` component — countdown text + "Stay logged in" button (button click counts as activity, dismisses itself).
- Mount point: clinic authenticated shell reads `useAdminSettings().idleTimeoutMinutes ?? 15`; platform authenticated shell reads `import.meta.env.VITE_PLATFORM_IDLE_TIMEOUT_MINUTES ?? 30`.
- `ClinicSettingsTab.tsx`: new "Security" section — number input, 5–120, wired into existing form/save flow (audit logging is automatic, inherited from `updateSettings()`'s generic diff-and-audit loop).
- `LoginView.tsx` / `PlatformLoginView.tsx`: read `?reason=idle` from the URL, show a small inline banner ("You were logged out due to inactivity").

## Out of scope

- The 5-minute branch-selection pending-token flow (unrelated, already has its own fixed expiry).
- Server-side token revocation / blacklisting (see ADR-0001).
- Live propagation of changed timeout values to already-open tabs.
- A general-purpose toast/notification system (banner is one-off, inline).

## Testing (`@qa-agent`)

- Unit: hook timer math under fake timers — activity resets, warning fires at the right offset, logout fires at the right offset, cross-tab `storage` event resets timers.
- Integration: `PUT /admin/settings` rejects `idleTimeoutMinutes` outside 5–120; staff/doctor can `GET` but not `PUT` it (existing RBAC pattern, `rbac.test.ts`); a custom role granted `clinic.profile.edit` CAN `PUT` it (union-of-permissions behavior, not a leak — confirmed by `@ba-agent` sign-off).

## BA sign-off

`@ba-agent` reviewed this spec against `anemal-rbac-matrix` and `anemal-functional-reqs` — **SIGN-OFF, ready for /write-plan** (2026-07-01). RBAC reuse of `clinic.profile.edit` confirmed correct (admin-only by default, matrix `permission-matrix.md:63,118`), plane isolation clean, audit coverage inherited automatically from `updateSettings()`, workflow trade-off (15 min default) explicitly reasoned and accepted.
