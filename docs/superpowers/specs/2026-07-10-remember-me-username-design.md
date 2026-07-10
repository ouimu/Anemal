# Design Spec — Remember Me: Username Recall (Clinic Login)

> Step 1 (brainstorm) output, per CLAUDE.md Standard Pipeline. Bug report: "Remember me"
> checkbox on the clinic login screen currently persists the full session (JWT) in
> `localStorage`, keeping the user logged in across browser restarts until the 8h JWT
> expires — but the user never notices, since a "remembered" session skips the login
> screen entirely. Reported symptom: "click remember me... it's not remember anything."
> User clarification: expected behavior is username-recall, not session persistence.
> Next steps per pipeline: `@pm-agent` (tasks/AC) → `@ba-agent` sign-off → `/grill-with-docs`
> (mandatory) → `/write-plan`.

## 1. Confirmed scope

Redefine "Remember me" on `LoginView.tsx` (clinic login only — no platform-console
equivalent exists, confirmed via grep) from "keep session alive across restarts" to
"recall which username(s) previously logged in on this browser/device, so multi-user
front-desk tablets can quickly pick a name instead of retyping it."

**In scope:**
1. Session always ends when the tab/browser/computer closes — no exceptions, regardless
   of checkbox state. (Removes today's `localStorage`-token persistence path.)
2. Checking "Remember me" + successful login saves the **username only** (never the
   password) to `localStorage`, keyed per browser origin (already tenant-scoped, since
   each clinic subdomain is a separate origin).
3. Unchecking "Remember me" + successful login removes that username from the saved list
   (if present).
4. 0 remembered usernames → today's blank form (username empty, checkbox unchecked).
5. Exactly 1 remembered username → pre-fill the username field and pre-check the box.
6. 2+ remembered usernames → a modal popup appears on page load listing them
   (most-recently-used first). Each row has a name and an **X** to forget that single
   entry immediately (no login required). Clicking a row: fills the username field,
   checks the box, closes the popup, moves focus to the password field. Dismissing the
   popup without picking: falls back to the blank-form state (empty field, unchecked box)
   — the user can type any username, including one not in the list.

**Out of scope:** password/credential storage of any kind; platform-console login;
wiring up the existing (currently-dead on the frontend) refresh-token endpoints; any cap
on the number of remembered usernames (a shared clinic tablet has few staff — YAGNI).

## 2. Design decisions

**2.1 Storage key & shape.** New `localStorage` key `vc_remembered_usernames` — JSON
array of `{ username: string, lastUsedAt: number }`, kept sorted newest-first. No
artificial size cap.

**2.2 Session storage simplification.** `authStore.setAuth` drops its `remember`
parameter entirely and always writes to `sessionStorage`. `loadPersisted()` drops the
`localStorage` fallback read. `refreshPermissions()` always persists its patch to
`sessionStorage`. This removes the `remember`-branching that previously chose between
`localStorage`/`sessionStorage` for the auth token — the token now only ever lives in
`sessionStorage`. `useSwitchBranch`'s `localStorage.getItem('vc_auth') !== null` remember
check is deleted along with it (dead once tokens never land in `localStorage`).

**2.3 Username recall is independent of the auth token.** The remembered-usernames list
lives under its own key, is never read/written by `authStore`, and survives logout /
session expiry (that's the point — it survives exactly what the session does not).

**2.4 Popup UX.** A modal (not a dropdown, not inline chips — user's explicit choice)
rendered only when the remembered list has 2+ entries. Renders once on `LoginView` mount;
does not re-open after being dismissed or after a pick, for the remainder of that page
load.

## 3. Architecture

| Area | Layer | Change |
|---|---|---|
| Username recall | Frontend, new small helper | `rememberedUsernames.ts` (or similar) in `utils/`: `list()`, `upsert(username)`, `remove(username)` — thin wrapper over `localStorage.getItem/setItem` on `vc_remembered_usernames`, JSON-parse/stringify, newest-first ordering on upsert. Try/catch around storage access (private-mode Safari throws) — swallow, degrade to "nothing remembered" like the existing `authStore` pattern. |
| Login screen | Frontend | `LoginView.tsx`: on mount, read the list; 0 → no-op; 1 → pre-fill `form.username` + `setRemember(true)`; 2+ → show popup state. On submit success: `remember ? upsert(form.username) : remove(form.username)`. |
| Popup component | Frontend, new small component | `RememberedUsersModal` (or inline in `LoginView.tsx` if small enough — defer file-split decision to `@uiux-agent`/`@dev-agent` at plan time) — renders the list, X-per-row calls `remove()` + re-renders list in place (no page reload), row-click fills form + closes modal, backdrop/close dismisses to blank form. |
| Auth store | Frontend | `authStore.ts`: `setAuth(data)` (param drop), `loadPersisted()` (sessionStorage-only), `refreshPermissions()` (sessionStorage-only patch persist). |
| `useAuth.ts` | Frontend | Callers of `setAuth`/`applyLogin` drop the `remember` argument they thread through today. |
| `useSwitchBranch` | Frontend | Drop the `localStorage.getItem('vc_auth') !== null` remember check; always call `setAuth(data)` with no second arg. |

No backend changes. No new endpoints, no new permission codes, no schema changes.

## 4. Error handling

- `localStorage` unavailable/throws (private browsing) → caught, treated as "nothing
  remembered" and "nothing saved this time" — same degrade-gracefully pattern already
  used in `authStore.ts`. Login itself is unaffected.
- Corrupt/non-JSON value under `vc_remembered_usernames` → caught on parse, treated as
  empty list (self-heals on next successful upsert, which overwrites with valid JSON).

## 5. Testing approach (Step 7 QA scope)

- `rememberedUsernames` helper: upsert new / upsert existing (bumps to front, updates
  timestamp) / remove present / remove absent (no-op) / corrupt-JSON read recovers to
  empty list / storage-throws degrades silently.
- `LoginView`: 0 remembered → blank form; 1 remembered → pre-filled + checked, no popup;
  2+ remembered → popup renders all entries most-recent-first; clicking a row fills form,
  checks box, closes popup, focuses password; X on a row removes just that entry and
  updates the still-open popup without navigating; dismissing popup → blank form, user
  can still type an arbitrary username; submitting with box checked → username appears in
  list on next mount; submitting with box unchecked while that username was previously
  remembered → username removed from list on next mount.
- `authStore`: `setAuth` always writes `sessionStorage` and never `localStorage`;
  `loadPersisted` no longer reads `localStorage` (a value written only there is not
  picked up); a full browser-restart simulation (clear `sessionStorage`, keep
  `localStorage`) results in logged-out state regardless of what's in `localStorage`.
- Regression: existing idle-logout (`useIdleLogout`) and cross-tab logout behavior
  untouched (no code path there references the auth storage key).

## 6. Open items for `@ba-agent` / `/grill-with-docs`

- Confirm no other consumer relies on `authStore`'s `localStorage` persistence (grep
  found none outside `useSwitchBranch`'s dead remember-check, listed in §3).
- Confirm the 8h JWT TTL applying uniformly now (session always ends at tab/browser
  close, or 8h, whichever first) matches clinic security expectations — this spec does
  not change TTL, only removes the localStorage escape hatch that let a session outlive
  a browser restart.
