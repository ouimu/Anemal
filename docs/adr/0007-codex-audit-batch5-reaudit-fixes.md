# ADR-0007 — Codex Audit Batch 5: Post-Fix Re-Audit Remediation

Date: 2026-07-08
Status: Accepted
Context: Fresh re-audit ran after Batches 1-4 merged (PRs #8-#11), verified via live runtime (DB/backend/frontend running). Found 2 P1s still open + 4 P2s + 3 P3s. BA validation (fable model) + adversarial grill (opus) both passed; grill found the BA's D1 framing would have silently regressed clinic-plane audit redaction — folded in as F1.2 below. Decision authority delegated.

Scope split (BA's own recommendation, grill-endorsed): **5A** = P1 security (D1+D2). **5B** = P2/P3 hygiene (D3-D6c) + doc-draft adoption. Independent, no shared code files; one test-file ordering dependency (FX.1) resolved by keeping D2's test backend-side.

## Decisions

### D1 — Direct-service platform audit redaction gap (5A)
Move `redact()`/`sanitize()` to `src/backend/utils/audit-sanitize.ts` (byte-identical across middleware and scrub script already — true move, not fork). Enforce inside `platform-audit.repository.ts` `createPlatformAuditLog()` so every repo write is redacted. Refactor all 8 direct `prisma.platformAuditLog.create` calls (platform-plans.service.ts:133,156,181; platform-customers.service.ts:190,236,264,288; platform-provisioning.service.ts:114) to go through the repo. Tighten `features: z.record(z.unknown())` → `z.record(z.boolean())` in both plan schemas (ADR-0003 D3 alignment; seeded plans all use `{}`, safe). Re-run `scrub-audit-secrets.ts` once post-merge.
**(grill F1.2, MANDATORY):** `audit.middleware.ts` computes `sanitize()` once and feeds BOTH clinic and platform audit sinks. D1 only enforces redaction in the platform repo — the middleware's `sanitize()` call MUST stay in place for the clinic branch (or redaction must also be added to `audit.repository.ts`), or clinic audit logs lose redaction entirely. Double-redaction on the platform path is idempotent and safe.
New regression test: DB-level query on a **direct-service** row (not middleware/HTTP path, which auditRedaction.test.ts already covers) — update a plan with `features: {apiToken: true}`, assert the persisted `plan.update` row's `details.changes.features.apiToken === '***'`.

### D2 — Company-type customer-detail contract (5A)
**(grill F2.1, correction):** the actual bug is frontend-only — `CustomerDetailView.tsx:60` reads `companyTypeId` via an `as` cast but the DTO only exposes nested `companyType.id`. Fix: either add scalar `companyTypeId` to the backend `CustomerDetail` DTO (repo already selects it, service just needs to surface it) OR have the frontend read `customer.companyType?.id` directly — pick the DTO-addition path (contract symmetry with the PUT, which already accepts top-level `companyTypeId`). Frontend maps picker `label = nameTh || nameEn || key` from `/platform/company-types` (unrelated to the DTO fix — options endpoint, not detail endpoint).
**(grill FX.1, MANDATORY):** put the round-trip regression test (edit customer with existing company type, save unchanged, assert persists) in the **backend integration suite**, not `PlatformConsole.test.tsx` — that file is independently rewritten by D6c (5B) and putting both edits in the same describe block creates a cross-batch merge conflict.

### D3 — featureFlags removal (5B)
Confirmed zero hidden consumers (not in schema.prisma, not in seed, only in controller + frontend hook/view). Remove: the Feature Flags card from `PlatformSettingsView.tsx`, `featureFlags` from `updateAllSettingsSchema` + `PlatformSettingsResponse` (`.strict()`).
**(grill F3.2, MANDATORY):** frontend card removal + backend schema removal ship in the **same PR** (removing the field while it's still `.strict()`-accepted-both-ways requires atomic deploy — a stale frontend still sending it would 400). Mark deferred in status matrix ("no consumer; re-add with persistence when a flag-reading feature ships").

### D4 — Plan quota frontend validation (5B)
`maxBranches`/`maxUsers` get `min={1}`, required, no "Unlimited" placeholder (backend already enforces positive-int, `.strict()`, seeded values are 1-100 range — no seed breakage). `maxOwners` stays `min={0}`/nullable/"Unlimited" — genuinely different semantics.
**(grill F4.2, MANDATORY):** these three fields currently render from one shared `.map()` loop with common `min`/`placeholder` — the fix needs per-`field.key` conditionals, not a blanket change. Backend null-as-unlimited semantics for branches/users is explicitly OUT of scope — recorded as a product backlog question, not this batch.

### D5 — Settings audit actor identity (5B)
Confirmed via `jwt.ts`: platform JWT payload is `{platformUserId, plane, role}` — **no userId field at all** (not zero, absent). `SettingsAuditLog.changedBy` FKs clinic `users(id)` — writing `platformUserId` there would be an id-collision bug, not a fix. Correct behavior: `changedBy` stays NULL on platform-plane settings writes (already happens today via `userId ?? null` — this decision hardens the comment/clarity, not behavior). Attribution lives in the companion `platform_audit_logs` row via `auditMiddleware` (proven to already fire correctly). Regression test: platform admin PUTs a setting; assert `settings_audit_log.changedBy IS NULL` AND a `platform_audit_logs` row exists with correct `performedByPlatformUserId`. One doc line in `anemal-platform-console` skill explaining the FK constraint and where attribution lives.

### D6a — Legacy role-string navigation (5B, defer)
4 sites confirmed (ClinicLayout.tsx:31, AdminLayout.tsx:54, useAuth.ts:97/112, LoginView.tsx:31). Server-side deny-by-default already proven (Batch 3: 148 routes × 3 roles, zero gaps) — this is UX-only, tied to the not-yet-shipped custom/multi-role Role Editor. Deferred to backlog item T-5B-02 (role-string retirement), file:line list recorded so it isn't rediscovered.

### D6b — Vaccination branch scope (5B, document only)
Confirmed intentional: create/list are pet-scoped (tenant-wide, following the pet across branches — matches ADR-0002's "clinical records follow the pet" precedent); only the operational worklist takes `branchId`. One paragraph added to RBAC matrix / clinical spec stating this explicitly. No code change — a branch guard on create would break the legitimate "vaccinated while visiting another branch" flow.

### D6c — PlatformConsole.test.tsx cleanup (5B, fix now)
**(grill correction):** both bullets in the "STOP-CLASS WIRING BUGS" test header are already fixed in the real hooks (`usePlatformCustomers.ts` normalizes raw→nested usage; `usePlatformAudit.ts` extracts `.items`) — the header is entirely stale, not just the usage half.
**(grill mandate, critical):** the existing throw-test mocks the hook itself, so it never exercises real normalization — flipping `.toThrow()` to a nested-shape assertion there would prove nothing (a landmine that would fail if the component were ever made defensive). Fix: either delete the throw-test, or add a genuine **unmocked** hook unit test asserting raw→nested normalization. Do not just invert the mock's expected output.

## Doc-draft adoption
Uncommitted on-disk edits (implementation-status-matrix.md, CLAUDE.md, README.md, several `.claude/skills/*` files) predate this ADR and were independently verified accurate by both BA and grill (tech-stack versions, two-planes JWT shape, matrix bug/implemented statuses, inventory barcode scan implemented). Fold into 5B commits rather than redo. Two forward edits required post-execution: featureFlags lines in `anemal-platform-console` change from "known gap" to "removed, deferred" (after D3); matrix rows for company-types/plans/settings flip `bug` → `implemented` (after D2/D3/D4 land).

## Grill record
PASS, 6 must-encode mandates, all folded into the decisions above (F1.2, F2.1, F3.2, F4.2, F6c, FX.1). No BLOCKING findings.

## Glossary additions
- **Audit sanitize choke point**: `utils/audit-sanitize.ts`, the single redaction implementation imported by both the audit middleware (both planes) and the platform audit repository (defense-in-depth against direct-service writes) and the scrub script.
- **Actor-anonymous audit row**: a `settings_audit_log` row with `changedBy IS NULL` by design on the platform plane (FK constraint prevents cross-plane id reuse); actor identity lives in the companion `platform_audit_logs` row instead.
