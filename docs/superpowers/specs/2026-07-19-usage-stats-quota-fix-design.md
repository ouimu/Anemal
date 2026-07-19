# Usage Stats Real Quota Fix — Design

**Date:** 2026-07-19
**Status:** Approved (brainstorm)

## Problem

Clinic Admin Dashboard → Usage Stats → "Plan quota" card shows fabricated numbers.

- `AdminUsage.tsx` hardcodes a `PLAN_LIMITS` map keyed by `planTier` string
  (`starter: 3 users`, `professional: 999`, `enterprise: 999`).
- The `'enterprise'` key does not exist — the real third plan key is
  `clinic_plus` (see `seed-rbac.ts`). The fallback (`PLAN_LIMITS.starter`)
  silently masks this for any tenant on that plan.
- The real seeded `starter` plan has `maxUsers: 5`, not 3 — the hardcoded
  value was never in sync with the actual plan data.
- A real quota engine already exists: `getEffectiveQuota()` in
  `platform-plans.service.ts` resolves `maxBranches` / `maxUsers` /
  `maxOwners` as `tenant_quotas` override ?? `Plan` default ?? unlimited.
  Platform admins can override any tenant's caps individually via
  `CustomerDetailView.tsx`. None of this reaches the clinic-side
  `/admin/usage` route — it only returns `getClinicUsage()`, which has no
  cap data at all.
- The "Registered patients" bar (`500` cap) is **entirely fictional** —
  no `maxPets` (or equivalent) field exists anywhere in the `Plan` or
  `TenantQuota` models. It cannot reflect a real per-tenant limit because
  no such limit is tracked.

**User-reported symptom:** clinic's actual max-user quota should be 10
(a per-tenant override), but the UI shows 3/3 because it never looks at
the real quota system.

## Approach

Add a 4th quota dimension, `maxPets`, to the existing quota system,
following the exact same plan-default + tenant-override pattern already
used for `maxBranches` / `maxUsers` / `maxOwners`. Then wire the clinic's
real effective quota into Usage Stats, deleting the fake `PLAN_LIMITS`
table entirely.

No new endpoint — `/admin/usage` is extended to also return `caps` from
`getEffectiveQuota()`, reusing the existing service function that already
powers the platform-side usage view.

## Data model changes

`schema.prisma`:

```prisma
model Plan {
  ...
  maxOwners   Int?    // NULL = unlimited
  maxPets     Int?    // NULL = unlimited   <- new
  ...
}

model TenantQuota {
  ...
  maxOwners   Int?
  maxPets     Int?    // NULL = inherit from plan   <- new
  ...
}
```

New migration seeds `maxPets` for the 3 existing plans:

| Plan key      | maxPets |
|---------------|---------|
| starter       | 500     |
| professional  | 5000    |
| clinic_plus   | null (unlimited) |

These are seed defaults editable afterward via the Platform Plans UI —
not hardcoded in application code.

## Backend changes

- **`platform-plans.repository.ts`** — add `maxPets` to `PlanRow`,
  `CreatePlanData`, `UpdatePlanData`, `QuotaOverrideData`; include in the
  `createPlan`/`updatePlan` Prisma calls (default `500` on create, same
  as `maxUsers` defaulting to `5`).
- **`platform-plans.service.ts`** — add `maxPets` to `PlanResponse`,
  `EffectiveQuota` (`plan` / `override` / `effective`), `normalizePlan()`,
  and the resolution line in `getEffectiveQuota()`:
  `maxPets: override?.maxPets ?? plan?.maxPets ?? null`.
- **`usage.service.ts`** — `getPlatformCustomerUsage()` gains a `pets`
  count via existing `usageRepo.countActivePets(tenantId)`, and folds
  `maxPets` into the `overPlan` boolean.
- **`admin.routes.ts`** `GET /admin/usage` — after `getClinicUsage()`,
  also call `getEffectiveQuota(tenantId)` and merge:
  `{ ...clinicUsageData, caps: effective }`. Requires
  `clinic.profile.view` permission (unchanged — same route, same guard).
- **`platform-plans.controller.ts`** — pass `maxPets` through create/update
  plan request validation (mirrors existing `maxOwners` handling, nullable).

## Frontend changes

- **`AdminUsage.tsx`** — delete `PLAN_LIMITS` map entirely. Read
  `data.caps.maxUsers` and `data.caps.maxPets` from the API response.
  Render `∞` when a cap is `null` (matches existing null-as-unlimited
  convention elsewhere in the app, e.g. `PlatformPlansView.tsx`). Users
  and Patients bars now reflect the tenant's real effective quota.
- **`PlatformPlansView.tsx`** — add "Max Pets" input to `PlanForm`'s grid
  (4 columns instead of 3) and a "Pets" column to the plans table. Update
  `EMPTY_FORM` with `maxPets: 500`.
- **`CustomerDetailView.tsx`** — add `maxPets` state + input to the
  per-tenant quota override editor, alongside the existing 3 fields.
- **`usePlatformPlans.ts`**, **`usePlatformCustomers.ts`** — extend
  `Plan`, `CreatePlanPayload`, and quota override payload TS types with
  `maxPets: number | null`.

## Testing

- Backend: extend `platformConsole.test.ts`, `platformContract.test.ts`,
  `subscription.test.ts` for the new field; new assertion in
  `adminSettings.test.ts` (or a new test) that `/admin/usage` returns
  real `caps` reflecting a `tenant_quotas` override, not a hardcoded value.
- Frontend: update `usePlatformPlans.test.ts`,
  `usePlatformCustomers.normalization.test.ts`, `PlatformConsole.test.tsx`
  for the new field. New/updated test asserting `AdminUsage` renders
  `data.caps` values, not the deleted `PLAN_LIMITS` table.

## Scope check (Ponytail gate)

- Files touched: `schema.prisma` + 1 migration, `platform-plans.repository.ts`,
  `platform-plans.service.ts`, `usage.service.ts`, `admin.routes.ts`,
  `platform-plans.controller.ts`, `AdminUsage.tsx`, `PlatformPlansView.tsx`,
  `CustomerDetailView.tsx`, `usePlatformPlans.ts`, `usePlatformCustomers.ts`
  (~11 files + tests)
- New endpoints: 0 (reuses `/admin/usage`)
- New dependencies: 0
- No new abstractions — mirrors the existing 3-field quota pattern exactly

## Out of scope

- No changes to how `maxOwners`/`maxBranches`/`maxUsers` are computed or
  displayed elsewhere (Platform Console customer list, subscription tab)
  beyond adding the parallel `maxPets` field.
- No retroactive enforcement/blocking when a tenant is already over the
  new `maxPets` cap — `overPlan` is informational only, matching how the
  other 3 caps behave today (no hard block found in this codebase for
  any existing cap either).
