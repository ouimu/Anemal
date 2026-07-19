# Grill — Usage Stats Real Quota Fix (Step 3.5, MANDATORY)

Date: 2026-07-19. Interview conducted by re-verifying every load-bearing claim
against live source, not by re-reading prose from prior docs.

Input: `docs/superpowers/specs/2026-07-19-usage-stats-quota-fix-tasks.md`
(Step 2), `docs/superpowers/specs/2026-07-19-usage-stats-quota-fix-ba-signoff.md`
(Step 3, APPROVE with corrections CORR-1/2/3).

## Claims re-verified directly (not just re-read)

- **CORR-1 path fix:** confirmed `AdminUsage.tsx` lives at
  `src/frontend/src/views/admin/AdminUsage.tsx`, not `views/clinic/` as
  T-USQ-3.1 guessed. BA's correction is right.
- **CORR-2 second resolver:** read `src/backend/services/subscription.service.ts`
  directly. Confirmed a second, independent `getEffectiveQuota()`
  (`EffectiveTenantQuota`) exists at line 63, with its own precedence chain
  (`override ?? plan ?? fallback`) and its own `getStatus()` consumed by
  `GET /subscription/status`. This is a real second live code path, not a
  duplicate of the platform one in name only — it has different fallback
  constants (`FALLBACK_BRANCHES = null`, `FALLBACK_USERS = null` vs the
  platform resolver's plain `null`) and different callers.
- **CORR-3 default-injection bug:** confirmed the `??` operator conflates
  "field omitted" with "field explicitly null" — `data.maxPets ?? 500` would
  silently turn an intentional "unlimited on create" (`maxPets: null`) into
  `500`. BA's fix (`=== undefined ? 500 : data.maxPets`) is correct and now
  required in T-USQ-2.1's implementation detail.

## New finding (F1) — quota enforcement is real and partial, not absent

Neither the design spec nor the tasks doc's "Out of scope" line
("no hard block exists for any of the 3 today") is correct. Verified:

- `subscription.service.ts` exports `assertCanAddUser`, `assertCanAddBranch`,
  `assertCanAddOwner` — each throws `QuotaExceededError` (409) at
  creation time once the effective cap is reached.
- `owner.service.ts:92` calls `assertCanAddOwner(tenantId)` inside
  `createOwner()`, before the DB write. Enforcement is live, not
  aspirational.
- No `assertCanAddPet` exists. `pet.service.ts:48` `createPet()` has zero
  quota check. Pets are the *only* one of the 4 tracked resources with a
  quota bar but no enforcement — a real inconsistency the original design
  missed by writing "no hard block exists for any" without checking.

**Resolved with the user (grill checkpoint):** add enforcement now, mirroring
`assertCanAddOwner` exactly. This is a scope expansion beyond the original
brainstorm (which was UI-display-only), accepted deliberately rather than
discovered post-hoc in code review.

## New finding (F2) — resolver wiring: subscription.service, not platform-plans.service

BA recommended `/admin/usage` call `subscription.service.getEffectiveQuota()`
instead of `platform-plans.service.getEffectiveQuota()`: better plane hygiene
(a clinic-plane route importing platform-console service code was already a
smell), and `subscription.service`'s resolver never throws
`CustomerNotFoundError` (it degrades to `null`/unlimited via optional
chaining on a possibly-null `tenant.plan`/`tenant.quota`), so it can't 500 a
clinic dashboard for a tenant in an edge state (e.g. mid-provisioning, no
plan yet).

**Resolved with the user:** confirmed. `/admin/usage` calls
`subscription.service.getEffectiveQuota()`. **Both** resolvers still gain
`maxPets` — the platform one still powers `PlatformPlansView.tsx` (plan
CRUD) and the Platform Console's per-customer usage view
(`platform-customers.service.ts` → `getPlatformCustomerUsage()`), which
legitimately needs the platform-plane resolver since it's viewing another
tenant's quota, not resolving its own.

## F3 — grandfathering: no new work needed (verified, not assumed)

`subscription.service.ts`'s own module doc states the existing policy
explicitly: *"Existing over-limit tenants are grandfathered: enforcement
fires on new creates only."* This is already implemented behavior for
`maxUsers`/`maxBranches`/`maxOwners` — `assertCanAddX` only ever fires on
the *next* create call, never retroactively. Adding `assertCanAddPet`
inherits this same grandfathering for free, by construction (same pattern,
same code shape). No migration-time backfill or grandfather-flagging logic
is needed for tenants already over the new `maxPets` default (e.g. 600 pets
on a 500-cap starter plan) — they simply can't add pet #601 until under
cap or the plan/override changes. This matches the informational
`overPlan: true` on the platform Usage view too. **No action required.**

## F4 — Ponytail scope re-check (file count, given F1 + F2)

Updated file list vs. the tasks doc's ~11:

1. `schema.prisma` + 1 migration
2. `platform-plans.repository.ts`
3. `platform-plans.service.ts`
4. **`subscription.service.ts`** (new — F2)
5. `usage.service.ts`
6. `admin.routes.ts`
7. `platform-plans.controller.ts`
8. **`pet.service.ts`** (new — F1, add `assertCanAddPet` call)
9. `AdminUsage.tsx`
10. `PlatformPlansView.tsx`
11. `CustomerDetailView.tsx`
12. `usePlatformPlans.ts`
13. `usePlatformCustomers.ts`

13 core files, still under the ≤15-file Ponytail gate (criterion 6). No new
endpoints (criterion 7 — `assertCanAddPet` is called from the existing
`createPet` flow, not a new route). No new dependencies (criterion 5). Two
new subsystems touched (`subscription.service.ts`, `pet.service.ts`) are
both extensions of the existing quota pattern, not new abstractions —
recommend Ponytail Gate (Step 5) still APPROVE, but flag the count moved
from 11→13 so `@ponytail-agent` re-checks with full information rather than
the stale count.

## Findings resolved — write-plan unblocked

All 4 findings (F1–F4) resolved directly with the user during this grill
session. 0 filed to backlog as blocking; RES-1/RES-2/RES-3 from the BA
sign-off remain backlogged (non-blocking, unchanged by this grill).

## Amendments applied to `2026-07-19-usage-stats-quota-fix-tasks.md`

- T-USQ-2.4: changed to call `subscription.service.getEffectiveQuota()`,
  not the platform-plans one.
- New task **T-USQ-2.6**: add `assertCanAddPet(tenantId)` to
  `subscription.service.ts` (mirrors `assertCanAddOwner` exactly, same
  `QuotaExceededError` shape) and call it from `pet.service.ts:48`
  `createPet()`, before the repository write.
- `subscription.service.ts`'s own `EffectiveTenantQuota` interface and
  resolver line updated alongside `platform-plans.service.ts`'s (was
  previously only specified for the platform one).
- Scope-summary table's file count updated 11→13; Ponytail scope note
  updated to reflect F1/F2.
- "Out of scope" line corrected: enforcement is now in-scope (F1), removed
  the incorrect "no hard block exists for any of the 3 today" claim.
