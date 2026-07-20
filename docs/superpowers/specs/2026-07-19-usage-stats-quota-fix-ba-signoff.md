# BA Sign-off — Usage Stats Real Quota Fix (`maxPets` + real caps in `/admin/usage`)

Date: 2026-07-19
Owner: @ba-agent
Branch: `fix/usage-stats-quota` (tasks doc at commit 63c850f)
Pipeline step: Step 3 of 8 (formal validation + sign-off)
Inputs: `2026-07-19-usage-stats-quota-fix-design.md`, `2026-07-19-usage-stats-quota-fix-tasks.md`
Method: `anemal-ba-toolkit` working method; all AS-IS claims independently re-verified against code (not taken from the design spec on trust).

---

## 1. Verdict

**SIGN-OFF GRANTED (APPROVE) — with corrections CORR-1..CORR-3 binding on `/write-plan`.**
`/write-plan` remains blocked until Step 3.5 `/grill-with-docs` runs and all findings — including CORR-2's wiring decision — are resolved.

---

## 2. Independent code verification (BA re-checked, 2026-07-19)

| # | Claim (design/tasks) | Verified | Evidence |
|---|---|---|---|
| V1 | `PLAN_LIMITS` hardcoded map exists, keyed on `planTier` with `?? PLAN_LIMITS.starter` fallback | CONFIRMED | `src/frontend/src/views/admin/AdminUsage.tsx:13,38-39` |
| V2 | Real plan keys are `starter` / `professional` / `clinic_plus` (so the map's `'enterprise'` key is dead) | CONFIRMED | `src/backend/prisma/seed-rbac.ts:273-275` |
| V3 | `usageRepo.countActivePets(tenantId)` exists and is tenant-scoped (→ OQ-1) | CONFIRMED | `src/backend/models/usage.repository.ts:13`; already consumed at `usage.service.ts:51,83` |
| V4 | `getPlatformCustomerUsage()` currently counts branches/users/owners only — no pets, no `maxPets` in `overPlan` | CONFIRMED — T-USQ-2.3 gap is real | `src/backend/services/usage.service.ts:21-30` |
| V5 | `GET /admin/usage` is clinic-plane, GET-only, guarded `requirePlane('clinic')` + `requirePermission('clinic.profile.view')`, tenantId from JWT context (no query-param tenant override) | CONFIRMED | `src/backend/routes/admin.routes.ts:15-17` |
| V6 | Plan CRUD guarded `platform.plans.view` / `platform.plans.manage` | CONFIRMED | `src/backend/routes/platform-plans.routes.ts:29-33` |
| V7 | Quota override routes guarded `platform.customers.view` (read) / `platform.quotas.manage` (write); customer usage guarded `platform.usage.view` | CONFIRMED | `src/backend/routes/platform-customers.routes.ts:54-55,58` |
| V8 | Schema pattern: `Plan.maxBranches @default(1)`, `Plan.maxUsers @default(5)` (DB defaults), `Plan.maxOwners Int?` nullable with **no** DB default; all three nullable on `TenantQuota`, no defaults | CONFIRMED | `schema.prisma:901-930` |
| V9 | Repo create-defaults applied in app code: `maxBranches ?? 1`, `maxUsers ?? 5`, `maxOwners ?? null` | CONFIRMED | `src/backend/models/platform-plans.repository.ts:82-84` |
| V10 | Platform resolver: `override?.x ?? plan?.x ?? null` per field (→ OQ-4) | CONFIRMED | `src/backend/services/platform-plans.service.ts:204-208` |
| V11 | **NEW FINDING:** a **second**, clinic-plane `getEffectiveQuota()` already exists in `subscription.service.ts` (`EffectiveTenantQuota`), with identical `override ?? plan ?? null` semantics, used by `assertCanAddUser/Branch/Owner` and `GET /subscription/status`. The design's "single existing `getEffectiveQuota()` function, no duplicated resolution logic" claim is factually wrong — duplication already exists (→ CORR-2) | CONFIRMED | `src/backend/services/subscription.service.ts:42-77,134-149` |
| V12 | Platform-side `getEffectiveQuota()` **throws `CustomerNotFoundError` (404)** on missing tenant; subscription-side returns null-unlimited fallback instead | CONFIRMED — relevant to which resolver `/admin/usage` should call | `platform-plans.service.ts:197-199` vs `subscription.service.ts:63-77` |
| V13 | Frontend paths (→ OQ-3) | CONFIRMED — see §3 OQ-3 | Glob, 2026-07-19 |

---

## 3. Open-question resolutions

### OQ-1 — `usageRepo.countActivePets(tenantId)` exists? → **YES, RESOLVED**

`export function countActivePets(tenantId: number, branchId?: number | null)` at
`src/backend/models/usage.repository.ts:13`. Already consumed by `getClinicUsage` (usage.service.ts:51)
and `getClinicSummary` (usage.service.ts:83). T-USQ-2.3 is correctly scoped: reuse only, no new
repository function, no new query surface, no change to the Ponytail file-count math from this item.
Note it takes an optional `branchId`; the platform-side pets count must call it **tenant-wide**
(`countActivePets(tenantId)`, no branch filter) so the count compared against `maxPets` is the whole
tenant, matching how `countBranches`/`countUsers`/`countOwners` are used in `getPlatformCustomerUsage`.

### OQ-2 — Where does the `maxPets: 500` create-default live? → **Application code in `createPlan`, NO Prisma `@default`** (CORR-3)

Recommendation and rationale against the existing patterns:

- **Follow the `maxOwners` shape at the schema level:** `maxPets Int?` nullable, **no DB-level default**,
  on both `Plan` and `TenantQuota`. Reasons:
  - `maxPets` is semantically a nullable cap (NULL = unlimited), exactly like `maxOwners` — the two
    non-nullable fields with `@default` (`maxBranches`, `maxUsers`) are the wrong precedent because
    they can never express "unlimited".
  - A Prisma `@default(500)` would emit `ADD COLUMN ... DEFAULT 500`, backfilling **every existing
    `plans` row to 500** (wrong for `clinic_plus`, which must be NULL) and — if mistakenly mirrored —
    would corrupt `tenant_quotas` rows, where a non-NULL value means "explicit override". Seeding per
    plan key via migration `UPDATE` (as the design already specifies) is the correct mechanism.
- **Follow the `maxUsers` shape at the repository level** for the create-default — but **not** with
  `??`. `data.maxPets ?? 500` coerces an explicit `null` ("create this plan with unlimited pets") into
  `500`, silently making unlimited-on-create impossible. Required form:
  `maxPets: data.maxPets === undefined ? 500 : data.maxPets`.
  (`maxUsers ?? 5` gets away with `??` only because it is non-nullable; `maxOwners ?? null` gets away
  with it because its default *is* null. `maxPets` is the first nullable field with a non-null default —
  neither existing idiom transfers verbatim.)
- Frontend `EMPTY_FORM.maxPets: 500` (T-USQ-3.2) stays as UX convenience; the backend must not depend
  on the frontend always sending a value (server is the boundary). Controller Zod schema: optional,
  nullable, non-negative integer — mirroring `maxOwners` validation.

### OQ-3 — Exact frontend paths → **RESOLVED (CORR-1)**

| Design-spec name | Verified repo-relative path |
|---|---|
| `AdminUsage.tsx` | `src/frontend/src/views/admin/AdminUsage.tsx` — **NOT** `views/clinic/` as T-USQ-3.1 guessed |
| `PlatformPlansView.tsx` | `src/frontend/src/views/platform/PlatformPlansView.tsx` |
| `CustomerDetailView.tsx` | `src/frontend/src/views/platform/CustomerDetailView.tsx` |
| `usePlatformPlans.ts` | `src/frontend/src/hooks/usePlatformPlans.ts` |
| `usePlatformCustomers.ts` | `src/frontend/src/hooks/usePlatformCustomers.ts` |

`/write-plan` must cite these paths verbatim.

### OQ-4 — NULL-override semantics identical to `maxOwners`? → **YES, keep identical, no new edge-case handling**

Verified resolver line pattern (`platform-plans.service.ts:204-208` and `subscription.service.ts:72-76`):
`override?.field ?? plan?.field ?? null`. Consequences, accepted as-is:

- `tenant_quotas.maxPets = NULL` → inherit plan default (never "override to unlimited").
- Corollary: when a plan has a **finite** `maxPets`, no per-tenant override can grant unlimited —
  only a very large number. This limitation already exists for `maxOwners` today; resolving it (e.g. a
  sentinel value or tri-state) would diverge from the design's "exact same pattern" mandate and expand
  scope. **Recommendation: identical behavior, zero new handling.** Log the shared limitation as
  residual backlog RES-2 (applies to all four fields equally, not this fix's problem).
- T-USQ-2.2 test case (3) correctly encodes this: override row present with `maxPets = NULL` falls
  through to plan default. Keep that test.

---

## 4. Corrections (binding on `/write-plan`)

**CORR-1 — AdminUsage path.** T-USQ-3.1 says `src/frontend/src/views/clinic/AdminUsage.tsx`; the file
is at `src/frontend/src/views/admin/AdminUsage.tsx`. Correct in the plan (full table in §3 OQ-3).

**CORR-2 — Dual quota resolver (design-spec factual error).** Two `getEffectiveQuota()` implementations
already exist (V11). Impact: (a) AC-USQ-2's "single existing `getEffectiveQuota()` function, no
duplicated resolution logic" is unattainable as worded; (b) whichever resolver `/admin/usage` skips
will drift the moment `maxPets` lands in only one of them — clinic `GET /subscription/status`
(`getStatus`, subscription.service.ts:134) would report a 3-field quota while Usage Stats shows 4.
Required resolution:

- **Both resolvers gain `maxPets`** in this change: `EffectiveQuota` (platform-plans.service.ts) *and*
  `EffectiveTenantQuota` + `getEffectiveQuota` + `getStatus` `withinLimits` (subscription.service.ts).
  Adds `subscription.service.ts` to the core-file list (~12 files; still type/line-level edits — no
  Ponytail-material change, but the Step 5 count must be honest).
- **Recommended wiring for `/admin/usage`: call `subscription.service.getEffectiveQuota(tenantId)`**
  (clinic-plane service), not the platform one. Rationale: (1) plane hygiene — a clinic route importing
  from `platform-plans.service` couples the clinic plane to platform-console code; the subscription
  service is already the established clinic-side quota reader (used by `subscription.routes` per the
  tasks doc's own convention citation); (2) robustness — the platform resolver throws
  `CustomerNotFoundError` (404) on a missing tenant (V12), which would turn the clinic Usage page into
  an error for an edge-state tenant, whereas the subscription resolver degrades to null/unlimited;
  (3) shape fit — the flat `EffectiveTenantQuota` is exactly the `caps` object the UI needs, without
  exposing the plan/override decomposition to the clinic plane. The design's Option (platform resolver)
  remains workable if grilling prefers it, but the drift risk (a) must then still be closed by
  extending both. **Decision point for Step 3.5 — do not write the plan until settled.**
- Consolidating the two resolvers into one is explicitly **out of scope** (backlog RES-3) — this fix
  mirrors patterns, it does not refactor them.

**CORR-3 — Create-default must be undefined-guarded, not `??`** (full rationale §3 OQ-2). Repository
`createPlan` uses `data.maxPets === undefined ? 500 : data.maxPets`; no Prisma `@default`; T-USQ-2.5
adds a test: `POST /platform/plans` with explicit `maxPets: null` persists `null` (unlimited), omitted
`maxPets` persists `500`.

---

## 5. Authorization validation (deny-by-default check)

| Surface | Plane | Method | Guard | Change? | Verdict |
|---|---|---|---|---|---|
| `GET /admin/usage` (+`caps`) | clinic | GET only | `requirePlane('clinic')` + `requirePermission('clinic.profile.view')`, JWT-derived `tenantId` (admin.routes.ts:15-17) | payload extended, guard untouched | PASS — clinic admins **see** caps, no write path to caps exists or is added on the clinic plane |
| `POST/PUT /platform/plans` (+`maxPets`) | platform | write | `platform.plans.manage` (platform-plans.routes.ts:30,32) | field added inside existing validated schema | PASS |
| `GET /platform/plans*` | platform | read | `platform.plans.view` (:29,:31) | field added to response | PASS |
| `GET /platform/customers/:id/quota` | platform | read | `platform.customers.view` (:54) | field added | PASS |
| `PUT /platform/customers/:id/quota` (+`maxPets` override) | platform | write | `platform.quotas.manage` (:55) | field added inside existing `setQuotaSchema` | PASS |
| `GET /platform/customers/:id/usage` (+pets count) | platform | read | `platform.usage.view` (:58) | field added | PASS |

- **No new permission codes, no new routes, no guard changes** — verified against the live route files,
  matching the tasks doc's cross-cutting claim.
- **Clinic caps are read-only by construction:** the only writers of `Plan`/`TenantQuota` are the two
  platform-guarded routes above; nothing under `/clinic/*`, `/clinic-admin/*`, `/settings/*`, or
  `/admin/*` writes them. Confirmed no write capability is introduced on the clinic plane.
- **Tenant isolation:** `/admin/usage` derives `tenantId` from `req.context` (JWT) only; AC-USQ-2's
  negative case and the qa-protocols isolation check (no query-param/body tenant override) are the
  right tests — keep both.
- **Plane boundary:** quota caps are tenant-owned configuration, not PII; a clinic reading *its own*
  effective caps crosses no plane boundary. The only plane-hygiene concern is the import direction
  addressed in CORR-2.
- **Data minimization note (binding):** `/admin/usage` returns the flat **effective** caps only —
  never the `plan`/`override` decomposition. Whether a number comes from a plan default or a
  platform-operator override is platform-plane operational detail; do not leak it clinic-side.
  (CORR-2's recommended wiring gives this for free.)

## 6. Gap analysis — tasks doc vs design spec

| ID | Design-spec promise | In tasks? | Status |
|---|---|---|---|
| G-1 | Schema `maxPets Int?` on `Plan` + `TenantQuota`; migration seeds 500/5000/NULL | T-USQ-1.1 | COVERED |
| G-2 | Repository types + create/update calls (+create default) | T-USQ-2.1 | COVERED (apply CORR-3) |
| G-3 | Service `PlanResponse`/`EffectiveQuota`/`normalizePlan`/resolution line | T-USQ-2.2 | COVERED |
| G-4 | `getPlatformCustomerUsage` pets count + `overPlan` fold | T-USQ-2.3 | COVERED (tenant-wide count per §3 OQ-1) |
| G-5 | `/admin/usage` merges `caps`, no new endpoint, guard unchanged | T-USQ-2.4 | COVERED (wiring per CORR-2) |
| G-6 | Controller validation for `maxPets` | T-USQ-2.5 | COVERED |
| G-7 | `AdminUsage.tsx` delete `PLAN_LIMITS`, render real caps, `∞` for null | T-USQ-3.1 | COVERED (path per CORR-1) |
| G-8 | `PlatformPlansView` field + table column + `EMPTY_FORM` | T-USQ-3.2 | COVERED |
| G-9 | `CustomerDetailView` override input | T-USQ-3.3 | COVERED |
| G-10 | Hook/type plumbing | T-USQ-3.4 | COVERED |
| G-11 | All named backend + frontend test files | T-USQ-* "Test proves done" lines | COVERED |
| **G-12** | *(missed by both docs)* second resolver in `subscription.service.ts` must gain `maxPets`; `GET /subscription/status` otherwise drifts to a 3-field quota | — | **GAP → closed by CORR-2 (new sub-task in `/write-plan`)** |

**Extras in tasks not in design (scope-creep check):** i18n TH/EN keys for new labels (Phase 9
convention — required, not creep); 44px touch targets (design-system compliance — required); grep-level
`PLAN_LIMITS` regression guard and `caps`-absent loading-state check (test hardening — accepted).
Nothing else added. **No scope creep found.**

**Residual observations (backlog, non-blocking):**
- **RES-1:** `getClinicUsage` still returns `planTier` from `TenantSetting.planTier ?? 'starter'`
  (usage.service.ts:69) — a free-text tier string that can drift from the tenant's actual `Plan`
  relation. After this fix, caps are real but any tier *badge* on the page still reads the settings
  string. Out of scope here; backlog a reconciliation item.
- **RES-2:** no mechanism to override a finite plan cap to unlimited (all four fields; §3 OQ-4).
- **RES-3:** two duplicate quota resolvers; consolidation deferred (CORR-2).

---

## 7. Definition-of-Ready check

| Criterion | Status |
|---|---|
| Objective stated | YES — replace fabricated Usage Stats quota numbers with the real FR-16 effective quota; add the missing 4th dimension |
| Actors & roles named | YES — clinic admin (view, `clinic.profile.view`); platform operator (edit, `platform.plans.manage` / `platform.quotas.manage`) |
| Permission codes assigned | YES — all existing, verified in §5; no new codes needed |
| Business rules | YES — effective = override ?? plan ?? null; NULL plan-cap = unlimited; NULL override = inherit; caps informational (no enforcement), matching existing 3 fields |
| Exception cases | YES — null caps render `∞`; missing `caps` in stale cached response must not throw; missing-tenant resolver behavior (CORR-2); explicit-null on create (CORR-3) |
| NFR impact | Negligible — one extra query per `/admin/usage` call (single `findUnique` with 2 includes); additive nullable column, no index needed (PK/unique lookups only) |
| Acceptance criteria testable | YES — AC-USQ-1/2/3 with negative + isolation cases; @qa-agent can execute all |
| Risks & dependencies | YES — task-order dependencies stated; risks = CORR-2 drift (closed), migration backfill hazard (closed by CORR-3's no-`@default` rule); @db-agent migration review mandated |

**READY** — conditional on CORR-1..CORR-3 being carried into `/write-plan` and CORR-2's wiring
decision being settled at Step 3.5 `/grill-with-docs`.

---

## 8. Hand-off

Next step per pipeline: **Step 3.5 `/grill-with-docs` (MANDATORY)** — grill focus suggestions:
CORR-2 wiring choice (subscription vs platform resolver), migration seed idempotency on
non-seeded/prod-like DBs, and the `caps`-absent frontend degradation path. Then `@pm-agent`
`/write-plan` with the corrected file list (~12 core files incl. `subscription.service.ts`) and the
verbatim paths from §3 OQ-3.
