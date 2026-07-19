# ADR-0018 — maxPets Quota: Dual-Resolver Wiring and Enforcement Scope

- **Status:** Accepted
- **Date:** 2026-07-19
- **Branch:** `fix/usage-stats-quota`
- **Context doc:** `docs/superpowers/specs/2026-07-19-usage-stats-quota-fix-design.md`,
  `docs/superpowers/specs/2026-07-19-usage-stats-quota-fix-ba-signoff.md`,
  `docs/superpowers/specs/2026-07-19-usage-stats-quota-fix-grill.md`
- **Produced by:** Step 3.5 `/grill-with-docs` (mandatory gate), human present —
  findings resolved live with the user.

## Context

The clinic Admin Usage Stats page ("Plan quota" card) was showing fabricated
numbers: `AdminUsage.tsx`'s `PLAN_LIMITS` map is a hardcoded lookup keyed by a
plan-tier string that doesn't match real plan keys (`'enterprise'` vs the
actual `clinic_plus`), and never reflects a tenant's real per-tenant quota
override. The fix adds a 4th quota dimension, `maxPets`, mirroring the
existing `maxBranches`/`maxUsers`/`maxOwners` pattern (`Plan` default,
optional `TenantQuota` override).

Two load-bearing facts surfaced only by reading the live code during
`@ba-agent` validation and the Step 3.5 grill — neither was visible from the
original brainstorm, which had not read `subscription.service.ts` or
`pet.service.ts`:

1. **Two independent quota resolvers exist**, not one. `platform-plans.service.ts`
   has a `getEffectiveQuota()` (platform-plane, powers `PlatformPlansView.tsx`
   and the Platform Console's per-customer usage view). `subscription.service.ts`
   has its **own**, separate `getEffectiveQuota()` (clinic-plane, powers
   `assertCanAddUser`/`assertCanAddBranch`/`assertCanAddOwner` and
   `GET /subscription/status`). The original design spec assumed a single
   resolver and would have left the clinic-plane one three fields wide
   forever if not caught.
2. **Quota enforcement already exists and is partial.** `owner.service.ts`
   calls `assertCanAddOwner()` before creating an owner, which throws a 409
   `QuotaExceededError` once the effective cap is reached. The same is true
   for users and branches. Pets have a quota *display* but never had
   enforcement — `pet.service.ts`'s `createPet()` has no quota check at all.
   The original design spec's "no hard block exists for any of the 3 today"
   claim was simply false.

## Decision record

### D-1 — Which resolver does `/admin/usage` call?

**Decision:** `subscription.service.ts`'s `getEffectiveQuota()` (clinic-plane),
not `platform-plans.service.ts`'s.

**Why:** Plane hygiene — a clinic-plane route (`admin.routes.ts`) importing
platform-console service code was already a smell independent of this fix.
Also, `subscription.service`'s resolver degrades to `null` (unlimited) via
optional chaining on a possibly-absent `tenant.plan`/`tenant.quota`, while the
platform one throws `CustomerNotFoundError` — the clinic dashboard should
never 500 for a tenant in an edge provisioning state.

**Consequence:** Both resolvers still gain `maxPets` — they are not merged
into one. `platform-plans.service.ts`'s resolver remains the one used for
plan CRUD and the Platform Console's cross-tenant usage view (legitimately
different from a tenant resolving its own quota). This is deliberate
duplication of a small resolution formula (3 lines), not a design flaw to
"fix" by consolidating — consolidation is logged as backlog (RES-3 in the
ba-signoff doc), out of scope here.

### D-2 — Should `maxPets` be enforced at creation time, or display-only?

**Decision:** Enforced. Add `assertCanAddPet(tenantId)` to
`subscription.service.ts`, mirroring `assertCanAddOwner` exactly (same
`QuotaExceededError` shape, same early-return on `null`/unlimited). Call it
from `pet.service.ts`'s `createPet()`, before the repository write — same
placement as `owner.service.ts:92`'s call in `createOwner()`.

**Why:** The original brainstorm scoped this as UI-display-only because the
reported bug was a UI number mismatch. But discovering mid-grill that 3 of
4 quota fields already enforce at creation time (and the 4th, `maxOwners`,
sets precedent as the most recently-added enforced field) makes
display-only for `maxPets` an inconsistency baked in from day one, not a
neutral choice. Fixing the display bug while leaving the system in a
newly-inconsistent state was not acceptable to the user once surfaced.

**Consequence:** Ponytail file count moves from 11 (original spec) to 13
(this fix now also touches `subscription.service.ts` and `pet.service.ts`).
Still under the ≤15-file gate. No new endpoints, no new dependencies — the
call is added to an existing creation path, not a new route.

### D-3 — Grandfathering for tenants already over the new default

**Decision:** No new logic. `subscription.service.ts`'s existing module doc
already states the policy: *"Existing over-limit tenants are grandfathered:
enforcement fires on new creates only."* `assertCanAddPet` inherits this for
free by using the same code shape as `assertCanAddOwner` — a tenant already
over cap can read/update/delete existing pets; only the *next create* is
blocked.

**Why:** This is already-established, already-tested behavior for the other
3 resources. Re-deriving it for pets would be inventing a new policy where
none is needed.

### D-4 — Unlimited-override ambiguity (`tenant_quotas.maxPets = NULL`)

**Decision:** Identical to the existing `maxOwners` ambiguity — `NULL` in
`tenant_quotas` always means "inherit from plan," never "override to
unlimited." A tenant on a finite-cap plan cannot be given unlimited pets via
override; only via a plan change.

**Why:** This is a pre-existing limitation across all 3 current fields, not
something this fix introduces or is expected to solve. Solving it would
require a schema change (e.g. a sentinel value or a separate "is override
active" boolean) affecting all 4 fields uniformly — out of scope, logged as
backlog (RES-2 in the ba-signoff doc).

## Glossary additions

- **Effective quota:** the resolved cap for a tenant on a given resource
  (`maxBranches`/`maxUsers`/`maxOwners`/`maxPets`), computed as
  `tenant_quotas` override ?? `Plan` default ?? unlimited (`null`). Two
  independent implementations exist by design (see D-1) — platform-plane
  (`platform-plans.service.ts`) and clinic-plane (`subscription.service.ts`).
- **Quota enforcement:** the `assertCanAddX(tenantId)` family in
  `subscription.service.ts` — called at resource-creation time, throws
  `QuotaExceededError` (409) when the effective cap is met or exceeded.
  Distinct from quota *display* (Usage Stats, Platform Console), which is
  informational only and never blocks an action by itself.
- **Grandfathering (quota context):** an existing tenant whose current
  resource count already exceeds a newly-lowered or newly-added cap is never
  retroactively blocked from using existing resources — enforcement applies
  only to the *next* creation attempt.
