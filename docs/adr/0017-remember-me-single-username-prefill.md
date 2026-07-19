# "Remember me" pre-fills the single most-recent username

Date: 2026-07-19
Status: Accepted
Supersedes: [0010](0010-remember-me-username-recall-not-session-persistence.md) (partial — session-lifetime decision stands; only the 2+ chooser UI is superseded)

## Context

ADR-0010 kept "Remember me" as username recall (never session persistence) and specified a
three-way UI: 0 saved → blank form; exactly 1 → pre-filled + pre-checked; **2+ → a
"Choose a username" modal listing all remembered usernames most-recent-first, each removable
via a per-row X.** The session-lifetime half of that decision (`sessionStorage`-only token,
no persistence) is unaffected by this ADR and remains in force.

In practice the 2+ chooser modal added meaningful surface area — a modal, backdrop/close/
type-to-dismiss handling, per-row forget affordances, focus management — for a low-value case
on a shared clinic login. The tablet is typically operated from a small, stable set of staff
accounts, and the most-recent user is correct the large majority of the time.

## Decision

**Collapse the recall UI to a single most-recent-username pre-fill; remove the 2+ chooser
modal.** On mount, `LoginView` reads the per-subdomain remembered list and, if it is non-empty,
pre-fills the username field with entry `[0]` (most-recent, since `upsert` unshifts) and checks
"Remember me". There is no modal for the 2+ case. The user can always type over the pre-filled
value to sign in as anyone else.

Behavior matrix (new):

| Remembered usernames (this subdomain) | Behavior |
|---|---|
| 0 | Blank form, checkbox unchecked |
| 1 | Pre-fill that username, check remember |
| 2+ | Pre-fill the **most-recent** username, check remember (no chooser) |

Unchanged from ADR-0010: only usernames are stored (never passwords), scoped per
`(subdomain, username)`; the list is subdomain-filtered; the auth token remains
`sessionStorage`-only.

## Consequences

- **Simpler LoginView** — the inline chooser modal (~90 lines) and its interaction/focus
  handling are removed. The `rememberedUsernames` util (`list`/`upsert`/`remove`) is retained
  as-is; only `list(...)[0]` is now consumed on mount.
- **Minor capability loss** — signing in as a non-most-recent remembered user requires typing
  the username rather than picking it from a list. Accepted as a reasonable trade for the
  reduced surface area.
- **Tests** — `LoginView.rememberMe.test.tsx` is rewritten to assert the single-prefill matrix
  and the type-over path; the modal-specific cases (row list, click-to-fill, per-row forget,
  close/backdrop/type dismiss) are removed.
