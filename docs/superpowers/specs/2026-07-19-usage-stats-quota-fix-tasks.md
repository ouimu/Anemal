# Usage Stats Real Quota Fix — Tasks + Acceptance Criteria

Date: 2026-07-19 · Step 2 (@pm-agent)
Input: `docs/superpowers/specs/2026-07-19-usage-stats-quota-fix-design.md` (Status: Approved — brainstorm)
Status: Draft for Step 3 `@ba-agent` sign-off. Next after sign-off: Step 3.5 `/grill-with-docs` (MANDATORY, non-skippable per CLAUDE.md).

FR reference: FR-16 (Plan & Quota — `plans` + `tenant_quotas`, effective quota = override ?? plan) and FR-15 (Platform Console — per-customer quotas). This work extends the existing FR-16 quota engine with a 4th dimension (`maxPets`) and closes a real defect: the clinic-facing Usage Stats screen currently shows fabricated numbers instead of the FR-16 effective-quota values that already govern `maxBranches`/`maxUsers`/`maxOwners`.

## Scope summary (Ponytail pre-check)

| Metric | Count | Limit |
|---|---|---|
| New endpoints | **0** (`GET /admin/usage` extended with existing `getEffectiveQuota()`; no new routes) | ≤3 |
| Migrations | 1 (`maxPets Int?` on `Plan` + `TenantQuota`, seeded for 3 existing plans) | — |
| Subsystems | 3 (DB schema, backend quota/usage services, frontend Admin/Platform UI) | ≤3 |
| Core files touched | ~11 (per design spec "Scope check") | ≤10 → **flag for BA/Ponytail**: spec lists 11; confirm during grill whether `usePlatformCustomers.ts`/`usePlatformPlans.ts` type-only edits count toward the file cap, or fold under scope-note below |
| New dependencies | 0 | ≤5 |
| New abstractions | 0 — mirrors existing 3-field quota pattern exactly | — |

**Scope note for Ponytail Gate:** the ~11-file count is inflated by pure type-plumbing (`usePlatformPlans.ts`, `usePlatformCustomers.ts` add one optional field to existing TS interfaces — no new hooks/queries). Actual new logic surface is: 1 migration, 1 resolution-line change (`getEffectiveQuota`), 1 route-merge change (`admin.routes.ts`), 3 form/table UI additions (`AdminUsage.tsx` deletion + read, `PlatformPlansView.tsx` field, `CustomerDetailView.tsx` field). No new endpoints, no new components, no new dependencies — recommend APPROVE at Ponytail Gate (Step 5) on these grounds, to be confirmed by `@ponytail-agent` at that step.

**Out of scope (backlog, do NOT touch):** enforcement/blocking of `maxPets` at create-time (informational only, matches existing `maxBranches`/`maxUsers`/`maxOwners` behavior — no hard block exists for any of the 3 today); any change to how the 3 existing caps are computed or displayed elsewhere (Platform Console customer list, subscription tab).

---

## USQ-1 — Schema: add `maxPets` to `Plan` and `TenantQuota`

**Objective:** Track a per-plan default and per-tenant override for max active pets, following the exact `maxOwners` pattern already in the schema.

Verified AS-IS (per design spec): `Plan.maxOwners Int?` and `TenantQuota.maxOwners Int?` exist; NULL = unlimited (plan) / inherit-from-plan (tenant override).

### T-USQ-1.1 Add `maxPets` columns + migration
- **Files:** `src/backend/prisma/schema.prisma` — add `maxPets Int?` to both `Plan` and `TenantQuota` models, positioned alongside `maxOwners`. New migration file under `src/backend/prisma/migrations/`.
- **Migration MUST:** seed `maxPets` for the 3 existing seeded plans per the design spec's table — `starter: 500`, `professional: 5000`, `clinic_plus: NULL` (unlimited). Existing `tenant_quotas` rows get `maxPets = NULL` (inherit from plan) by column default — no backfill logic needed since NULL is the correct "no override" state.
- **@db-agent review required** (CLAUDE.md: all DB changes; also tenant-isolation-adjacent since `TenantQuota` is tenant-keyed).
- **Test proves done:** migration applies cleanly on the seeded dev DB; `npx prisma validate` passes; existing `platformConsole.test.ts` / `subscription.test.ts` suites still green (regression guard — no existing test should break from an additive nullable column).

**AC-USQ-1:** Given the migration has run, when any of the 3 seeded plans is queried, then `maxPets` returns `500` / `5000` / `null` respectively; when a tenant has no `tenant_quotas` row (or a row with `maxPets = NULL`), then no override is recorded and plan default applies.

---

## USQ-2 — Backend: `maxPets` through the quota-resolution and CRUD chain

**Objective:** `maxPets` flows through create/update/read for both `Plan` and `TenantQuota`, and resolves via `getEffectiveQuota()` using the identical override-then-plan-then-null precedence as the other 3 fields.

### T-USQ-2.1 Repository: `maxPets` in row types + CRUD
- **Files:** `src/backend/models/platform-plans.repository.ts` — add `maxPets` to `PlanRow`, `CreatePlanData`, `UpdatePlanData`, `QuotaOverrideData` interfaces; include in the `createPlan`/`updatePlan` Prisma `create`/`update` calls (default `500` on create, matching how `maxUsers` defaults to `5` today — confirm exact default-injection point during BA validation).
- **Test proves done:** extend existing repository-level test (or `platformConsole.test.ts` if repository is exercised through it) asserting a created `Plan` persists and returns `maxPets`; an updated `Plan` changes `maxPets`; a `TenantQuota` override row persists `maxPets` distinct from its plan's default.

### T-USQ-2.2 Service: `maxPets` in response shapes + resolution
- **Files:** `src/backend/services/platform-plans.service.ts` — add `maxPets` to `PlanResponse` and `EffectiveQuota` (all three of `plan` / `override` / `effective` sub-shapes) and to `normalizePlan()`; add the resolution line in `getEffectiveQuota()`:
  `maxPets: override?.maxPets ?? plan?.maxPets ?? null`.
- **Test proves done:** unit test on `getEffectiveQuota()` — (1) no override present → returns plan's `maxPets`; (2) override present with `maxPets` set → override wins; (3) override row exists but its `maxPets` is `NULL` → falls through to plan default (not treated as "override to unlimited" — this is the same ambiguity already resolved for `maxOwners`, confirm identical behavior, do not diverge); (4) plan `maxPets` is `NULL` and no override → effective is `null` (unlimited).

### T-USQ-2.3 Backend: pet count into usage response
- **Files:** `src/backend/services/usage.service.ts` — `getPlatformCustomerUsage()` gains a `pets` count via existing `usageRepo.countActivePets(tenantId)` (verify this repository function already exists per design spec; if it does not, this is a BA-flagged gap — see Open Question OQ-1 below), and folds `maxPets` into the existing `overPlan` boolean alongside the other 3 caps.
- **Test proves done:** extend `subscription.test.ts` (or equivalent usage-service test) — tenant with pet count exceeding effective `maxPets` sets `overPlan: true`; tenant within cap sets `overPlan: false`; `maxPets: null` (unlimited) never triggers `overPlan` regardless of pet count.

### T-USQ-2.4 Backend: `/admin/usage` returns real caps, no new endpoint
- **Files:** `src/backend/routes/admin.routes.ts` — `GET /admin/usage` handler: after calling `getClinicUsage()`, also call `getEffectiveQuota(tenantId)` and merge into the response: `{ ...clinicUsageData, caps: effective }`. Route guard unchanged: `clinic.profile.view` (verified — matches existing `settings.routes` and `subscription.routes` convention, permission-matrix.md:70,145,156).
- **Test proves done:** new/extended test in `adminSettings.test.ts` (or a new `adminUsage.test.ts`) asserting: (1) response includes `caps.maxUsers`, `caps.maxBranches`, `caps.maxOwners`, `caps.maxPets`; (2) a tenant with a `tenant_quotas` override (e.g. `maxUsers: 10`) returns `caps.maxUsers: 10` in `/admin/usage`, not the plan default — this is the exact regression the design spec's "user-reported symptom" describes (UI showed 3/3 when actual override was 10); (3) tenant-isolation: caller only ever sees their own tenant's effective quota (JWT `tenantId`-scoped, no query-param override possible).

### T-USQ-2.5 Backend: `maxPets` through Plan create/update validation
- **Files:** `src/backend/controllers/platform-plans.controller.ts` — pass `maxPets` through `createPlanSchema`/`updatePlanSchema` validation (mirrors existing `maxOwners` handling: nullable integer, optional on update).
- **Test proves done:** extend `platformContract.test.ts` — `POST /platform/plans` with `maxPets: 500` persists and returns it; `PUT /platform/plans/:id` with `maxPets: null` sets unlimited; invalid value (negative number, non-integer) is rejected with existing validation-error shape (same as `maxOwners`'s existing invalid-value test, if one exists — mirror it).

**AC-USQ-2:** Given a tenant with an active `tenant_quotas` override on `maxUsers` (e.g. 10) and no override on `maxPets` (inherits plan default), when the clinic calls `GET /admin/usage`, then `caps.maxUsers` reflects the override (10) and `caps.maxPets` reflects the plan default — both computed by the single existing `getEffectiveQuota()` function, no duplicated resolution logic. **Negative/authorization case:** a user without `clinic.profile.view` (or from a different tenant/plane) calling `/admin/usage` gets the existing deny-by-default response (401/403, unchanged by this change) — confirm no new gap is introduced by the added `caps` merge.

---

## USQ-3 — Frontend: delete fake `PLAN_LIMITS`, render real caps

**Objective:** Usage Stats page shows the tenant's actual effective quota, not a hardcoded/mismatched lookup table (whose `'enterprise'` key doesn't even match the real `clinic_plus` plan key).

### T-USQ-3.1 `AdminUsage.tsx` — delete fake table, read real caps
- **Files:** `src/frontend/src/views/clinic/AdminUsage.tsx` (or wherever this view lives — confirm exact path during implementation; design spec references it by filename only) — delete the `PLAN_LIMITS` map entirely (including the broken `'enterprise'` key and the stale `starter: 3` value). Read `data.caps.maxUsers` and `data.caps.maxPets` from the `/admin/usage` response. Render `∞` when a cap is `null` (matches existing null-as-unlimited convention in `PlatformPlansView.tsx`).
- **Test proves done:** new/updated frontend test asserting: (1) `AdminUsage` renders `data.caps.maxUsers`/`data.caps.maxPets` values from the mocked API response, not any hardcoded constant; (2) a `null` cap renders `∞`; (3) grep-level regression guard — `PLAN_LIMITS` identifier no longer exists in the file (prevents silent reintroduction).

### T-USQ-3.2 `PlatformPlansView.tsx` — Max Pets field in Plan editor
- **Files:** `src/frontend/src/views/platform/PlatformPlansView.tsx` — add "Max Pets" input to `PlanForm`'s grid (becomes 4 columns instead of 3), add a "Pets" column to the plans table, update `EMPTY_FORM` with `maxPets: 500` (matches the create-default in T-USQ-2.1).
- **Test proves done:** extend `PlatformConsole.test.tsx` — creating a plan with a Max Pets value submits `maxPets` in the payload; the plans table renders a Pets column with the correct value (including `∞` for `null`).

### T-USQ-3.3 `CustomerDetailView.tsx` — Max Pets in per-tenant override editor
- **Files:** `src/frontend/src/views/platform/CustomerDetailView.tsx` — add `maxPets` state + input to the quota-override editor, alongside the existing 3 fields (`maxBranches`/`maxUsers`/`maxOwners`).
- **Test proves done:** frontend test asserting setting a Max Pets override submits it via `PUT /platform/customers/:id/quota` (guarded `platform.quotas.manage`, verified route at `platform-customers.routes.ts:55`) and the field reflects the currently-effective value on load (guarded `platform.customers.view`, `platform-customers.routes.ts:54`).

### T-USQ-3.4 Type plumbing
- **Files:** `src/frontend/src/hooks/usePlatformPlans.ts`, `src/frontend/src/hooks/usePlatformCustomers.ts` (confirm exact paths) — extend `Plan`, `CreatePlanPayload`, and quota-override payload TS types with `maxPets: number | null`.
- **Test proves done:** `usePlatformPlans.test.ts` and `usePlatformCustomers.normalization.test.ts` updated — normalization/default-fill logic (if any) handles `maxPets` the same way it handles `maxOwners` (e.g. `null` passthrough, no coercion to `0`).

**AC-USQ-3:** Given a clinic admin opens Usage Stats, when the page loads, then the "Registered patients" bar shows the tenant's real effective `maxPets` (plan default or tenant override, never a fictional `500` constant) and the "Users" bar shows the real effective `maxUsers` — reproducing the fix for the reported symptom (override of 10 now displays as 10/10, not 3/3). **Negative case:** a plan with `maxPets: null` shows `∞`, and Usage Stats does not throw or render `NaN`/`undefined` when `caps` is temporarily absent from an older cached response shape (loading/error state check).

---

## Cross-cutting requirements (all tasks)

- **Permissions:** no new permission codes. Clinic-side rides existing `clinic.profile.view` (verified, permission-matrix.md:70). Platform-side rides existing `platform.plans.view` / `platform.plans.manage` (platform-plans.routes.ts:29-33) and `platform.customers.view` / `platform.quotas.manage` (platform-customers.routes.ts:54-55). Deny-by-default preserved; no route changes, no guard changes.
- **Multi-tenancy:** `getEffectiveQuota(tenantId)` is already tenant-scoped (existing function, reused as-is — not modified in its tenant-scoping logic, only extended with one more field). `@db-agent` reviews the migration; `@qa-agent` runs isolation tests per `.claude/roadmap/qa-protocols.md`, specifically confirming `/admin/usage` never accepts a tenant override via query param or body (JWT-derived `tenantId` only).
- **i18n:** any new UI label ("Max Pets", "Registered patients" caption changes) gets Thai + English keys (Phase 9 convention, no library).
- **Design system:** 44px touch targets on new form inputs, tokens only, Material Symbols only if icons are added — per `anemal-design-system`.
- **No new npm dependencies. No new files** except: 1 migration. All other changes are edits to existing files (schema, repository, service, controller, route handler, 3 views, 2 hook files, their respective test files).

---

## Open questions for `@ba-agent` (Step 3 validation)

| # | Question | Why it matters |
|---|---|---|
| OQ-1 | Does `usageRepo.countActivePets(tenantId)` already exist, as the design spec assumes ("via existing `usageRepo.countActivePets(tenantId)`")? | If it does not exist, T-USQ-2.3 is under-scoped — a new repository function would be a 12th file and a new query surface requiring its own tenant-isolation test, changing the Ponytail file-count math. |
| OQ-2 | Confirm the exact create-default injection point for `maxPets: 500` in `platform-plans.repository.ts` — is it in the controller's Zod schema default, the repository's `createPlan`, or the frontend `EMPTY_FORM` only (i.e., does the backend require or merely accept `maxPets` on create)? | Determines whether T-USQ-2.1/T-USQ-2.5 need a schema-level default vs. relying on frontend always sending a value. |
| OQ-3 | Confirm exact frontend file paths — design spec names `AdminUsage.tsx`, `PlatformPlansView.tsx`, `CustomerDetailView.tsx`, `usePlatformPlans.ts`, `usePlatformCustomers.ts` without directory paths. | Needed before `/write-plan` can cite exact paths per CLAUDE.md Step 4 requirement ("exact file paths, interfaces, tests"). |
| OQ-4 | Should the `tenant_quotas.maxPets = NULL` "no override, inherit plan" vs "override to unlimited" ambiguity (same ambiguity as existing `maxOwners`) be resolved identically, or does this fix present an opportunity to clarify it? | Design spec says "following the exact same pattern" — recommend keeping identical behavior (no new ambiguity-resolution work), but flagging so BA can confirm this isn't quietly expanding scope. |

---

## Dependencies

- T-USQ-2.* depends on T-USQ-1.1 (migration) landing first.
- T-USQ-3.* depends on T-USQ-2.4 (`/admin/usage` returning `caps`) and T-USQ-2.5 (Plan CRUD accepting `maxPets`) landing first.
- Full task list depends on OQ-1 through OQ-4 being resolved during `@ba-agent` sign-off (Step 3) and stress-tested at `/grill-with-docs` (Step 3.5) before `/write-plan` (Step 4) — per CLAUDE.md, `/write-plan` is BLOCKED until both gates pass.
