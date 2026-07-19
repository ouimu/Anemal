# "Remember me" recalls a username, it does not extend the session

Date: 2026-07-10
Status: Accepted (2+ username chooser UI superseded by [0017](0017-remember-me-single-username-prefill.md); session-lifetime decision still in force)

Reported bug: clinic login's "Remember me" checkbox appeared to do nothing. Root cause:
it silently persisted the full JWT session in `localStorage` (surviving browser restart
until the 8h TTL), which the user never *saw* happen — a remembered session skips the
login screen entirely, so there was no visible feedback that anything had been
remembered. This ADR records the grilling outcome (Step 3.5) that redefined the feature.

**Decision: "Remember me" no longer affects session lifetime at all.** The auth token
lives only in `sessionStorage`. A session ends when the tab/browser/app is actually
closed, or at 8h JWT expiry, whichever comes first — with no opt-out. Backgrounding the
app (tablet screen lock, switching apps, the browser tab losing focus) does **not** end
the session, because `sessionStorage` is scoped to the browsing context's lifetime, not
to foreground/background state — it is only cleared when that context is torn down. This
was confirmed during grilling as the required tablet behavior ("close session only close
application or 8hrs; if not close application but move to background, it's okay to stay
sign-in") and required no design change — `sessionStorage`-only already provides it.

Instead, checking the box + logging in saves **only the username** (never the password)
to a separate `localStorage` list (`vc_remembered_usernames`), scoped per `(subdomain,
username)` pair. 0 saved → today's blank form. Exactly 1 → pre-filled + pre-checked. 2+ →
a popup lists them for the user to pick, most-recent-first, each entry removable via a
per-row X without logging in.

**Considered alternative: keep session persistence, add username pre-fill on top.**
Rejected by explicit user decision during brainstorming — closing the tab/browser/
computer must always end the session, full stop; there is no tier of user who gets a
longer-lived session via this checkbox.

**Tenant-isolation correction (found at BA sign-off, before this could ship).** The
original design assumed one browser origin maps to one tenant ("subdomain is part of the
hostname"). False: the Clinic ID / subdomain field on the login form is user-editable
(auto-detected but overridable), and the backend resolves tenant from the posted field,
not the Host header. Without scoping, one browser could accumulate — and the popup would
disclose — usernames across multiple clinics. Every remembered entry now carries the
`subdomain` it was saved under, and recall/removal only ever matches within the subdomain
currently typed into the form.

**Legacy-data migration.** Anyone who had the old "stay logged in" behavior already has a
full auth blob (JWT + tenantId + permissions) sitting in `localStorage`. `clearAuth()`
already removed it on explicit logout, but a user who simply never logs out again would
keep it indefinitely (expired, but readable). `loadPersisted()` now actively sweeps and
deletes any legacy `vc_auth` key from `localStorage` on module load, regardless of
whether a session is being restored from `sessionStorage`.

**Matching rules, decided during grilling:**
- Username matching is case-insensitive (`Alice`/`alice` are one entry; the display shows
  whichever casing was typed most recently) — mirrors how clinic login itself treats
  usernames.
- Subdomain matching is case-insensitive — subdomains are effectively hostnames, and an
  exact-match requirement would silently show an empty list to someone who typed the
  Clinic ID with different capitalization than last time.
- The 2+ popup is a dismissible overlay, not a focus-trapping dialog: clicking the
  backdrop/X dismisses it, and — per explicit user decision — starting to type directly
  into the username field behind it also dismisses it (the field is not blocked while the
  popup is open). This was chosen over a strict blocking modal to avoid forcing an extra
  dismiss click when the user already knows what they want to type.

**Accepted risk, confirmed during grilling.** The remembered-username list (and the
popup) surfaces valid staff usernames to anyone physically at a shared device, before
authentication, and lets anyone remove entries without a password. Accepted as-is: a
username alone is not a working credential, and this is a low-traffic front-desk device
scenario. If this becomes a real problem later, that is a new, separately-scoped
decision — not reopened here.

**Out of scope, explicitly.** Wiring up the backend's existing (frontend-dead)
refresh-token endpoints to extend sessions — that would reopen the "how long should a
session live" question this ADR just closed in the other direction, and is a materially
larger, separate feature.
