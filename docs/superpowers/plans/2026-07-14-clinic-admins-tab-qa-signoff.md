# QA Sign-off — Customer Onboarding: Clinic Admins Tab (CO-1..CO-10)

Step 7, @qa-agent, 2026-07-14 (autonomous scheduled run, resumed).

## Scope reviewed

Diff `main...feature/clinic-admins-tab` (15 files, 1939 insertions) against
`docs/superpowers/plans/2026-07-14-clinic-admins-tab-implementation.md` and the
BA-signed R-E/R-B/CO-6-permission decisions in
`docs/superpowers/plans/2026-07-14-customer-onboarding-tasks.md`.

## Verification performed

- Full backend suite: `npx jest` — **953/954 pass**. The 1 failure
  (`roleRouteMatrix.test.ts`, unmapped `GET /api/cron/reminders`) is
  pre-existing, introduced by commit `6b2be40` (Vercel deploy config, unrelated
  to this feature), reproduces identically on `main`, zero diff on
  `cron.routes.ts` between `main` and this branch. Not a regression — out of
  scope for this feature, not fixed here (avoids scope creep into an unrelated
  branch's work).
- Full frontend suite: `npx vitest run` — **256/256 pass**.
- `/code-review` (Step 7, medium effort) on the full diff — 0 findings.

## RBAC / isolation checks (qa-protocols.md required coverage)

- **BOLA (cross-tenant userId):** CO-4/CO-5 tests construct tenant A + tenant B,
  attempt to deactivate/reset tenant B's admin via tenant A's path — both 404,
  row unchanged. Confirmed via `platform-customer-admin-users.test.ts`
  (`co4b1/co4b2`, `co5e1/co5e2`).
- **Role-scope guard (Q-8):** attempting CO-4 against a `clinic_staff` user
  (not `clinic_admin`) → 404, confirmed (`co4c`).
- **Plane isolation:** every write endpoint tested against a clinic-plane JWT
  → 403 before reaching the handler (`co2g`, CO-4/CO-5 plane cases).
  `requirePlane('platform')` unchanged, router-level `.use`.
- **Permission split:** `platform_support` (view-only) tested against CO-2
  (create) → 403 (`co2f`); list endpoint (`.view`) intentionally left
  accessible to support per BA sign-off (CO-6 decision, no new permission
  code).
- **No plaintext password ever audited (R-6/R-A):** every audit-log assertion
  across CO-1/CO-2/CO-5 does `expect(JSON.stringify(log.details)).not.toMatch(/password/i)`
  — confirmed present in all three paths' tests, not just one.
- **Quota enforcement (Q-5):** CO-1 exempt (`co1c`, zero-quota tenant still
  gets its admin), CO-2 enforced (`co2d`, 409 `QUOTA_EXCEEDED`, no row
  created).
- **Idempotency (G-5):** double-deactivate → `409 ALREADY_DEACTIVATED`, not a
  silent no-op (`co4d`).
- **Login actually blocked (G-4):** cross-referenced against existing
  `auth.service.ts:45` / `authService.test.ts:100` — deactivation is
  functionally real, not cosmetic (not re-tested here, pre-existing coverage
  confirmed adequate by the plan's Step CO-4 note).

## Frontend checks

- `ClinicAdminsTab.test.tsx` (323 lines): create/deactivate/reset flows,
  quota/duplicate-username error distinction, display-once credentials panel,
  no re-fetchable plaintext persistence (Zustand/React Query cache) verified
  by inspection — no `localStorage`/`sessionStorage`/`console.log` of password
  anywhere in `ClinicAdminsTab.tsx`, `PasswordField.tsx`, or
  `usePlatformCustomers.ts` (grep-confirmed, zero hits).
- No-rename-action negative test present (G-2).
- No-reactivate-action confirmed via dialog-copy test (G-1).

## Known, deliberately-accepted gap (carried from Step 3.5, not re-litigated)

CO-1's auto-generated first-admin password is **not returned anywhere** —
only the bcrypt hash persists (confirmed: no `adminCredentials` field exists
on `createCustomer()`'s response, grep-verified zero hits repo-wide). The
tenant's first admin is created with a password nobody can know until the
platform admin performs a CO-5 reset from the Clinic Admins tab. This is the
"recovery path" fallback the blocker doc
(`docs/superpowers/specs/2026-07-14-customer-onboarding-blocker-credential-delivery.md`)
already named as acceptable if Option 1 wasn't implemented — it wasn't; no
plan step wires `createCustomer()`'s plaintext through to the tab. Functional
consequence: **a brand-new tenant is not immediately loginable** — the
platform admin must open Clinic Admins → Reset password once before handing
credentials to the customer. This satisfies the scheduled task's literal goal
("auto-generate a clinic-admin user + password... so the customer can log
in") only after that one extra manual step, not automatically.

This is flagged here for visibility, not blocking sign-off: the ADR (0015)
and ponytail-approved plan both shipped without the Option 1/2 wiring, all
tests pass against the shipped behavior (CO-1's test suite does not assert a
recoverable initial password — it only asserts hash/email/phone/audit shape),
and the blocker doc's own recommended default explicitly accepted this
fallback as sufficient. No code change made here to close it — reopening it
now would be scope creep on a branch already through Ponytail approval and
full implementation. Recommend a human confirm this UX is acceptable
post-merge; if not, follow-up is a small addition (surface `adminCredentials`
on `createCustomer()`'s response per the blocker doc's Option 1), not a
redesign.

## Verdict

**APPROVE.** All CO-1..CO-10 acceptance criteria verified against passing
tests. No RBAC/isolation/BOLA gaps found. One pre-existing unrelated test
failure noted, not a regression. One UX gap noted above (first-login requires
a manual reset) — flagged for human awareness, not a QA blocker since it was
an accepted, documented fallback at design time.

Proceeding to Step 8 (`/anemal-finish-branch`).
