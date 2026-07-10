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
array of `{ username: string, subdomain: string, lastUsedAt: number }`, kept sorted
newest-first. No artificial size cap.

> **BA amendment (tenant scoping — required).** The original draft assumed
> origin = tenant ("already tenant-scoped, since each clinic subdomain is a separate
> origin"). That assumption is false in general: `LoginView.tsx` exposes the subdomain
> as an *editable text input* (auto-detected but overridable, and defaulting to
> `dev-clinic` on localhost), and the backend resolves the tenant from the posted
> `subdomain` field, not the Host header. One origin can therefore accumulate
> usernames from multiple tenants, and the recall list/modal would disclose clinic A's
> staff usernames to someone logging into clinic B from the same browser — a
> cross-tenant information leak. Fix: every entry carries the `subdomain` it was saved
> under; `list()` filters to the subdomain currently in the form (the auto-detected one
> on mount), and `upsert`/`remove` match on `(subdomain, username)` pairs. Entries
> missing `subdomain` (never shipped, but defensive) are treated as non-matching.

**2.2 Session storage simplification.** `authStore.setAuth` drops its `remember`
parameter entirely and always writes to `sessionStorage`. `loadPersisted()` drops the
`localStorage` fallback read. `refreshPermissions()` always persists its patch to
`sessionStorage`. This removes the `remember`-branching that previously chose between
`localStorage`/`sessionStorage` for the auth token — the token now only ever lives in
`sessionStorage`. `useSwitchBranch`'s `localStorage.getItem('vc_auth') !== null` remember
check is deleted along with it (dead once tokens never land in `localStorage`).

> **BA amendment (legacy-token migration sweep — required).** Users who checked the old
> "Remember me" already have a full auth blob (JWT + userId/tenantId/role/permissions)
> sitting under `vc_auth` in `localStorage`. `clearAuth()` KEEPS removing from both
> storages (defensive), but `clearAuth` only fires on explicit logout or 401 — a user
> who simply never logs in again on that browser would carry that stale credential
> artifact indefinitely. Therefore `loadPersisted()` (module load) additionally does a
> one-line `localStorage.removeItem('vc_auth')` sweep (inside the existing try/catch)
> while reading only from `sessionStorage`. This guarantees the legacy remembered token
> is destroyed on the first page load after this ships, not merely ignored.

**2.3 Username recall is independent of the auth token.** The remembered-usernames list
lives under its own key, is never read/written by `authStore`, and survives logout /
session expiry (that's the point — it survives exactly what the session does not).

**2.4 Popup UX.** A modal (not a dropdown, not inline chips — user's explicit choice)
rendered only when the remembered list has 2+ entries. Renders once on `LoginView` mount;
does not re-open after being dismissed or after a pick, for the remainder of that page
load.

> **Grilling amendment (dismiss-on-type — resolved 2026-07-10, see ADR-0010).** Not a
> focus-trapping dialog: the username field behind the popup is never blocked. Backdrop
> click, the per-modal close/X, AND typing directly into the username field all dismiss
> the popup (the keystroke that dismisses it also lands in the field — no swallowed
> first character). Chosen over a blocking modal by explicit user decision, to avoid
> forcing an extra dismiss click when the user already knows what to type.

**2.5 Matching is case-insensitive on both parts of the key (resolved at grilling, see
ADR-0010).** `upsert`/`remove`/`list` compare `subdomain` case-insensitively (subdomains
are effectively hostnames) and `username` case-insensitively (mirrors clinic login's own
username handling) — but storage keeps whatever casing was most recently typed for
on-screen display. `alice` logging in after a saved `Alice` updates the same entry (moves
to front, casing now shows `alice`), it does not create a second entry.

## 3. Architecture

| Area | Layer | Change |
|---|---|---|
| Username recall | Frontend, new small helper | `rememberedUsernames.ts` (or similar) in `utils/`: `list(subdomain)`, `upsert(subdomain, username)`, `remove(subdomain, username)` — thin wrapper over `localStorage.getItem/setItem` on `vc_remembered_usernames`, JSON-parse/stringify, newest-first ordering on upsert. Try/catch around storage access (private-mode Safari throws) — swallow, degrade to "nothing remembered" like the existing `authStore` pattern. |
| Login screen | Frontend | `LoginView.tsx`: on mount, read the list (filtered to the detected/current subdomain); 0 → no-op; 1 → pre-fill `form.username` + `setRemember(true)`; 2+ → show popup state. |
| Persistence trigger | Frontend, `useAuth.ts` | **BA-corrected (was "LoginView on submit success").** `handleSubmit` has no success callback — it fire-and-forgets `login.mutate()`. Login success is only observable inside `useAuth.ts`: (a) direct-login path — `loginMutation.onSuccess` has `vars.username`/`vars.remember`/`vars.subdomain`, calls `upsert`/`remove` after `applyLogin` resolves; (b) branch-selection path — `selectBranchMutation.onSuccess` vars are only `{pendingToken, branchId}`, so `loginMutation.onSuccess` additionally stashes a `pendingUsername` (and subdomain) state — the exact pattern the hook already uses for `remember` via `setRemember(vars.remember)` — consumed by the branch path's `onSuccess`. `useAuth.ts` owns username persistence; `LoginView.tsx` owns only recall/pre-fill/popup UX. |
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
  empty list / storage-throws degrades silently / **`list(subdomain)` returns only
  entries saved under that subdomain — an entry saved under tenant A's subdomain never
  appears when tenant B's subdomain is in the form, matched case-insensitively (`Dev-Clinic`
  finds an entry saved under `dev-clinic`)** / entry lacking a `subdomain` field is never
  returned / **username matching is case-insensitive — `upsert('Alice')` then
  `upsert('alice')` results in exactly one entry, displaying `alice` (last-typed casing
  wins), not two entries.**
- `LoginView`: 0 remembered → blank form; 1 remembered → pre-filled + checked, no popup;
  2+ remembered → popup renders all entries most-recent-first; clicking a row fills form,
  checks box, closes popup, focuses password; X on a row removes just that entry and
  updates the still-open popup without navigating; dismissing popup → blank form, user
  can still type an arbitrary username; submitting with box checked → username appears in
  list on next mount; submitting with box unchecked while that username was previously
  remembered → username removed from list on next mount; **typing directly into the
  username field while the popup is open dismisses the popup and the keystroke is not
  lost.**
- `authStore`: `setAuth` always writes `sessionStorage` and never `localStorage`;
  `loadPersisted` no longer reads `localStorage` (a value written only there is not
  picked up); a full browser-restart simulation (clear `sessionStorage`, keep
  `localStorage`) results in logged-out state regardless of what's in `localStorage`;
  **migration sweep: after module load with a legacy `vc_auth` value in
  `localStorage`, that key has been actively removed, not merely ignored.**
- Regression: existing idle-logout (`useIdleLogout`) and cross-tab logout behavior
  untouched (no code path there references the auth storage key).

## 6. Open items — ALL RESOLVED (Step 3.5 grilling complete, 2026-07-10)

Full decision record: [ADR-0010](../../adr/0010-remember-me-username-recall-not-session-persistence.md).

**Resolved at BA sign-off (2026-07-10):**
- ~~Confirm no other consumer relies on `authStore`'s `localStorage` persistence~~ —
  CONFIRMED by BA source verification: `useAuth.ts:138` (`useSwitchBranch`'s dead
  remember-check, deleted by this spec) is the only consumer. `useIdleLogout` uses its
  own activity-heartbeat localStorage key, never `vc_auth`; `platformAuthStore` uses a
  separate `platform-auth` sessionStorage key — plane separation unaffected.

**Resolved at grilling (2026-07-10):**
1. ~~Session-lifetime policy~~ — CONFIRMED: close-tab/browser/app-or-8h, whichever first,
   with no opt-out, is correct. Clarified requirement: tablet **backgrounding** (screen
   lock, app-switch, losing focus) must NOT end the session, only actually closing the
   app/tab does. No design change needed — `sessionStorage` is scoped to the browsing
   context's lifetime, not foreground/background state, so this was already satisfied.
2. ~~Shared-tablet username disclosure~~ — ACCEPTED AS-IS. Recorded as a deliberate,
   revisitable-later risk acceptance in ADR-0010, not a silent gap.
3. ~~Username dedupe casing~~ — RESOLVED: case-insensitive (§2.5). Subdomain matching is
   also case-insensitive (found during grilling, not in the original 3 questions — a
   user retyping the Clinic ID with different capitalization must not see an empty list).

**Found and resolved during grilling (not in the original 3 questions):**
4. ~~Popup vs. typing-through interaction~~ — RESOLVED: typing into the username field
   while the 2+ popup is open dismisses it instead of blocking input (§2.4). Not a
   focus-trapping dialog.

No findings remain open. Proceeding to `/write-plan`.
