# BLOCKER — CO-1 initial-admin credential delivery path undefined

**Raised:** 2026-07-14, autonomous scheduled run, Step 4 (`/write-plan`), before any plan file
written. Pipeline status was STEP 3.5 COMPLETE at start of this run (grill findings G-1..G-7 all
resolved, `/write-plan` marked unblocked) — this is a **new** gap found while writing the plan,
not a reopening of a closed grill finding.

## The gap

Brainstorm §7 Q-2 (human-approved 2026-07-14):

> Display-once in platform UI. For initial creation: shown in the new **Clinic Admins tab**, not
> the create-customer response/modal (create-customer flow stays a plain success, admin then opens
> the tab to see the generated credentials).

This requires the auto-generated password from CO-1 (`createCustomer()` transaction — see task
breakdown CO-1) to be visible when the platform admin later opens the Clinic Admins tab (CO-7/CO-6
list).

But:

- Passwords are never stored in plaintext anywhere in this codebase (`bcrypt.hash(...)` only,
  confirmed in `user.service.ts`, `create-platform-admin.ts`) and the task breakdown does not
  propose changing that — correctly, storing a recoverable plaintext password would be a much
  worse security posture than what's being fixed.
- CO-6's own acceptance criteria (list endpoint, `GET /:id/admin-users`) explicitly states:
  *"`passwordHash` never appears in the response"* — and lists only
  `id, username, name, email, phone, isActive, createdAt`. No password field, ever, on this
  endpoint, by design (a list endpoint returning a live-fetchable password would itself be a
  security bug — anyone who can list can read the current password indefinitely).
- CO-1's own acceptance criteria (task breakdown, `«R-E-DECISION»` block resolved in BA sign-off)
  never states that `createCustomer()`'s response contains the generated password. Q-7 (audit
  logging) explicitly forbids logging it. No task file anywhere defines a response shape, a
  transient client-side cache, a one-time token, or any other channel carrying the plaintext from
  the moment `generateSecurePassword()` runs (inside the `prisma.$transaction`, discarded from
  memory once hashed) to the moment the platform admin's browser renders it in the tab.

In short: **the plaintext password exists in server memory for a few milliseconds during CO-1's
transaction, then is gone forever** (only the bcrypt hash persists) — unless something is added to
carry it out. Nothing in the approved brainstorm, BA sign-off, or grill findings names that
something. This is not a UI polish gap; it is a missing API contract that CO-1 and CO-7 both
depend on and currently contradict each other about (Q-2 says "shown in the tab", CO-6 says "tab's
list endpoint never contains a password").

Compare: CO-2 (create additional admin) and CO-5 (reset password) do NOT have this problem — both
are synchronous request/response actions where the response can carry the plaintext once (their
ACs say exactly this: *"response includes the plaintext exactly once"*). CO-1 is different because
tenant creation and "opening the tab" are two separate requests, possibly separated by any amount
of time, possibly two different browser tabs/sessions, possibly a different platform-admin user
entirely (if RBAC allows more than one `platform_super_admin`).

## Why this needs a human decision, not a default guess

This is explicitly a "password generation/storage" decision, called out by name in this task's own
governing instructions as something not to silently guess on. The candidate options have real
security/UX tradeoffs a human should pick:

**Option 1 — Return it in the create-customer API response; frontend holds it in transient
client-side state only (not persisted, not re-fetchable) until the admin navigates to the new
tenant's Clinic Admins tab.**
- Pro: no new backend storage, no new expiry/cleanup logic, matches Q-2's "not in the
  response/modal" *UI* framing if read narrowly (the field is in the wire response but the
  create-customer *modal component* simply doesn't render it — it's plumbed through to whatever
  view renders next).
- Con: fragile — a page refresh, a different tab, or closing the browser before navigating to the
  Clinic Admins tab loses the password with no recovery path *except* CO-5 (reset), which is
  probably an acceptable fallback but should be stated as the explicit recovery story.
- This reading is a stretch against Q-2's literal wording ("not the create-customer
  response/modal") — Q-2 seems to intend the password is genuinely absent from that response.

**Option 2 — Short-lived server-side reveal token: CO-1 stores the plaintext encrypted
(reusing the existing AES-256-GCM settings-secret mechanism per CLAUDE.md) with a TTL (e.g. 5–15
min) and a one-time-read flag; a new `GET /platform/customers/:id/admin-users/:userId/reveal-initial-password`
endpoint (or similar) returns it once, then deletes the encrypted copy.**
- Pro: matches Q-2's wording precisely (tab fetches it separately, create-customer response really
  does stay plain).
- Con: new storage table/column + TTL cleanup job, larger blast radius, is exactly the kind of
  "new subsystem" the Ponytail Gate (CLAUDE.md) would scrutinize — likely fails Ponytail criterion
  1 (does this need to exist at all) unless the fragility of Option 1 is judged unacceptable.

**Option 3 — Reopen Q-2: initial creation does NOT auto-generate+deliver a password at all. CO-1
creates the `clinic_admin` user with `isActive = false` (or a null/unusable passwordHash sentinel)
and the platform admin must use CO-5 (reset password) on their first visit to the tab to set the
real, deliverable password.**
- Pro: eliminates the delivery gap entirely — no plaintext ever needs to survive across requests,
  because there's no "initial" password to deliver; CO-5's synchronous response covers it.
- Con: reopens a already-human-approved decision (Q-1/Q-2 as written assume CO-1 does generate and
  eventually deliver a password) and adds a mandatory extra step (a tenant is unusable until the
  platform admin visits the tab and resets), which contradicts the stated goal in the scheduled-
  task brief: *"the system must AT MINIMUM auto-generate a clinic-admin user + password for that
  new tenant, so the customer can log in."* A `clinic_admin` with no working password cannot log
  in — this option would need the human to explicitly accept "tenant creation alone is not
  sufficient to enable login" as new scope, contradicting the goal as stated.

## Recommended default (if resumed without further human input)

**Option 1**, because it requires no new subsystem (passes Ponytail cleanly), matches CO-2/CO-5's
existing "plaintext in the mutating response, once" precedent, and the fragility case (browser
closed before navigating to the tab) already has a built-in recovery path via CO-5 reset — which
this run would make explicit in CO-1's/CO-7's acceptance criteria as the documented recovery story,
so it isn't a silent gap. Concretely:

- `createCustomer()` (CO-1) response gains a `adminCredentials: { username: string, password:
  string }` field, present exactly once on that response, never persisted server-side beyond the
  hash, never included in the audit log details (Q-7 unchanged), never returned by any other
  endpoint (GET `/:id`, GET `/:id/admin-users`, etc. — CO-6's "never a password field" AC stays
  correct and unchanged).
- Frontend: on successful tenant creation, the create-customer flow (still "plain success" per
  Q-2's UI intent — no password modal pops up there) stores `adminCredentials` in a short-lived,
  non-persisted client state (e.g. passed via in-memory navigation state when routing to
  `CustomerDetailView`, or a Zustand slice cleared on unmount/tab-change) and the Clinic Admins tab
  (CO-7), if it detects this in-memory value on its first render for this tenant, displays the
  same display-once credentials panel CO-8/CO-10 already use — then clears it. Navigating away and
  back, or a page reload, no longer shows it (matches "display-once").
- Explicit recovery story added to CO-7/CO-9's copy: if the admin missed the one-time display,
  "Reset password" (CO-5/CO-10) generates a fresh one.

This default is **not applied to any plan file in this run** — it is recorded here for a human to
confirm or override, per instruction not to guess on password-handling decisions.

## What this blocks

`/write-plan` (Step 4) cannot proceed to a final CO-1/CO-7 plan until this is resolved, because:
- CO-1's task-file acceptance criteria need a new line item for the response shape (or an explicit
  "no credential in response" line if Option 3 is chosen instead).
- CO-7's task-file acceptance criteria need a line item for how the tab consumes/displays it (or
  none, if Option 3).
- The Ponytail Gate pre-check (task file, "Ponytail Gate pre-check" section) currently doesn't
  account for the transient-state plumbing (Option 1) or a new reveal endpoint (Option 2) — whichever
  is chosen changes the file/endpoint count estimate slightly.

Everything else in the task breakdown (CO-2 through CO-6, CO-8 through CO-10) is unaffected by this
gap and could in principle be planned/built independently, but per CLAUDE.md this feature is being
planned as one unit and Step 4 has not produced a plan file yet in this run, so nothing is
partially written to avoid a half-resolved plan document.

## Status

**BLOCKED — awaiting human decision (Option 1 / 2 / 3 above, or a different resolution).**
No plan file has been written. `docs/superpowers/plans/2026-07-14-customer-onboarding-tasks.md`
is unchanged. Next scheduled run: re-check this file first — if a human has appended a decision
below this line, resume Step 4 (`/write-plan`) with that decision folded into CO-1/CO-7's ACs. If
still unresolved, do not re-guess; re-raise only if new information changes the tradeoffs, otherwise
leave as-is awaiting human input (per instruction: don't re-raise the same resolved-nothing blocker
every run without cause).

---

## Human decision

*(empty — awaiting input)*
