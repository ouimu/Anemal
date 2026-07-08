# Codex Audit Batch 5A — P1 Security Fixes (Post-Fix Re-Audit)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Source of truth:** `docs/adr/0007-codex-audit-batch5-reaudit-fixes.md` (D1–D2, authoritative). BA sign-off + grilling (Step 3.5) both complete — grill returned PASS with 2 mandates folded into 5A's scope: **F1.2** (audit middleware's `sanitize()` call must stay active for BOTH clinic and platform branches — D1 is additive defense-in-depth, not a removal) and **FX.1** (the D2 round-trip regression test goes in the backend integration suite, not `PlatformConsole.test.tsx`, to avoid a cross-batch merge conflict with 5B's D6c). This plan only implements already-resolved decisions; it does not re-litigate them.

**Goal:** Close the 2 P1 security findings from the fresh re-audit that ran after Batches 1–4 merged (PRs #8–#11): (D1) a direct-service platform audit redaction gap — 8 call sites across 3 services write to `platformAuditLog` via raw `prisma.platformAuditLog.create` instead of the redacting repository function, and a plan's `features` field accepted arbitrary JSON (`z.record(z.unknown())`) that could carry a secret-like key straight into that unredacted path; (D2) a company-type customer-detail contract gap — `CustomerDetailView.tsx:60` reads `companyTypeId` via an unsafe `as` cast because neither the backend DTO nor the frontend hook's `CustomerDetail` type actually expose it.

**Branch:** `fix/codex-audit-batch5a-security`

**Scope:** 2 tasks (T1 = D1, T2 = D2), independent of each other and of Batch 5B (no shared files — verified: 5B's D3–D6c touch `PlatformSettingsView.tsx`, `system-settings.controller.ts`, plan-quota frontend fields, `SettingsAuditLog`, legacy nav strings, vaccination docs, and `PlatformConsole.test.tsx`; none overlap this batch's files).

**Never commit:** `RecomendByCodex/` (source audit input, not a project doc) or `.claude/roadmap/ACTIVE/*` (working scratch, not a tracked deliverable). Also do **not** commit the pre-existing uncommitted doc-draft edits currently on disk (`implementation-status-matrix.md`, `CLAUDE.md`, `README.md`, various `.claude/skills/*` files) — those are verified-accurate but belong to Batch 5B's scope; leave them uncommitted for 5B to pick up.

**Order:** T1 → T2 → T3 (final verification). Independent tasks, sequential commits for a clean, reviewable history per ADR decision order (D1 → D2).

---

## Global Constraints (from ADR-0007 + grill record)

- **(grill F1.2, MANDATORY)** `audit.middleware.ts`'s `sanitize()` call (line 47, feeding both the clinic `AuditLog` and platform `PlatformAuditLog` branches) MUST remain active and unchanged in behavior after T1. T1 adds redaction inside `platform-audit.repository.ts` as a **second, independent layer** (defense-in-depth against direct-service writes that bypass the middleware entirely) — it does not replace or weaken the middleware's existing redaction. Double-redaction on the platform path (middleware redacts once, repository redacts again) is idempotent and safe by construction (`redact()` is deterministic; re-redacting an already-`***`-masked key is a no-op).
- **(grill FX.1, MANDATORY)** T2's round-trip regression test lives in `src/backend/tests/integration/platformContract.test.ts` (or a new backend integration test file, implementer's call) — never in `src/frontend/src/__tests__/PlatformConsole.test.tsx`, which Batch 5B's D6c independently rewrites. Putting both edits in the same file/describe block creates a cross-batch merge conflict.
- Every "verify against X before writing" note below was already verified by reading the real file in this planning session (paths, line numbers, exact code). Still spot-check nothing drifted between planning and execution — fast-moving code can go stale in hours.
- One commit per task. Each commit message ends with the required co-author trailer.

---

### Task 1 (ADR D1): Audit-sanitize choke point + close the direct-service redaction gap

**Files:**
- Create: `src/backend/utils/audit-sanitize.ts`
- Modify: `src/backend/middlewares/audit.middleware.ts`
- Modify: `src/backend/scripts/scrub-audit-secrets.ts`
- Modify: `src/backend/models/platform-audit.repository.ts`
- Modify: `src/backend/services/platform-plans.service.ts`
- Modify: `src/backend/services/platform-customers.service.ts`
- Modify: `src/backend/services/platform-provisioning.service.ts`
- Modify: `src/backend/controllers/platform-plans.controller.ts`
- Create/modify test: `src/backend/tests/integration/auditRedaction.test.ts` (new `describe` block) — or a new focused test file, implementer's call; reuse the existing platform-token/tenant setup already in that file if added there.

**Verified facts (this session):**
- `redact()`/`sanitize()` are **byte-identical** in `audit.middleware.ts:15,22-37` and `scrub-audit-secrets.ts:23,25-35` (same `SENSITIVE_KEY_PATTERN`, same recursive logic) — a true move, not a fork.
- `platform-audit.repository.ts:71-81` `createPlatformAuditLog()` currently writes `entry.details` straight through with no redaction — this is the gap.
- All 8 direct call sites confirmed at the exact ADR line numbers:
  - `platform-plans.service.ts:133` (`plan.create`), `:156` (`plan.update`), `:181` (`plan.delete`)
  - `platform-customers.service.ts:190` (`customer.create`), `:236` (`customer.update`), `:264` (`tenant.suspend`), `:288` (`tenant.reactivate`)
  - `platform-provisioning.service.ts:114` (`provisioning.update`)
  - Each call currently passes `{ action, targetTenantId, performedByPlatformUserId, details }` inline — the repo function's `PlatformAuditEntry` interface (`platform-audit.repository.ts:57-63`) already accepts exactly this shape, so the refactor is a straight swap of `prisma.platformAuditLog.create({ data: {...} })` → `platformAuditRepo.createPlatformAuditLog({...})` (drop the `data:` wrapper key, keep the same field values).
- `platform-plans.controller.ts:23` (`createPlanSchema`) and `:33` (`updatePlanSchema`) both currently declare `features: z.record(z.unknown()).optional()` — tightening to `z.record(z.boolean())` matches ADR-0003 D3 alignment; seeded plans all use `{}` so no seed breakage.
- `auditRedaction.test.ts` already exists with a working platform-token + tenant fixture (`beforeAll`/`afterAll`, lines 1–85) — the new regression test can reuse `platformToken` and a plan created inline, no new fixture scaffolding needed.

- [x] **Step 1 (TDD, red): write the failing regression test first**

  In `auditRedaction.test.ts`, add a new `describe('audit redaction — direct-service platform writes (D1)', ...)` block:
  - Create a plan via `POST /platform/plans` with `platformToken` (or directly via `plansRepo.createPlan` if the route requires `features` shaped as booleans only — use a plain `{}`-features plan).
  - `PUT /platform/plans/:id` with body `{ features: { apiToken: true } }` (note: this is the **key name** `apiToken` matching `SENSITIVE_KEY_PATTERN` — the test is about the key, not a secret string value; `z.record(z.boolean())` still accepts this shape).
  - Query `prisma.platformAuditLog.findMany({ where: { action: 'plan.update' }, orderBy: { createdAt: 'desc' }, take: 1 })`.
  - Assert `rows[0].details.changes.features.apiToken === '***'`.
  - Run it now — it must **fail** (current `updatePlan()` writes `details.changes` via raw `JSON.parse(JSON.stringify(data))` with no redaction).
  - Add cleanup for the created plan in `afterAll` (delete the plan + its audit rows), following the file's existing cleanup pattern.

- [x] **Step 2: Create `src/backend/utils/audit-sanitize.ts`**

  Move (not duplicate) the exact `SENSITIVE_KEY_PATTERN`, `redact()`, `sanitize()` from `audit.middleware.ts` verbatim:
  ```ts
  /**
   * Single redaction implementation shared by the audit middleware (both planes),
   * the platform audit repository (defense-in-depth against direct-service writes),
   * and the one-time scrub script. Deny-by-default: any object key matching
   * SENSITIVE_KEY_PATTERN is redacted, at any nesting depth, including inside arrays.
   *
   * @module audit-sanitize
   */

  /** Deny-by-default: any key matching this pattern is redacted, at any nesting depth. */
  export const SENSITIVE_KEY_PATTERN = /(password|secret|apikey|api_key|token|credential)/i

  /**
   * Recursively redacts any object key matching SENSITIVE_KEY_PATTERN, at any depth,
   * including inside arrays and nested objects. Replaces matched values with '***'.
   * Non-plain-object/array leaves pass through unchanged.
   */
  export function redact(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redact)
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '***' : redact(v)
      }
      return out
    }
    return value
  }

  /** Sanitizes a request-body-shaped value for audit persistence; non-objects return undefined. */
  export function sanitize(body: unknown): Record<string, unknown> | undefined {
    if (!body || typeof body !== 'object') return undefined
    return redact(body) as Record<string, unknown>
  }
  ```

- [x] **Step 3: `audit.middleware.ts` imports from the new util (grill F1.2 — sanitize() call stays active for BOTH branches)**

  Delete the local `SENSITIVE_KEY_PATTERN`/`redact`/`sanitize` definitions (lines 14–37), replace with:
  ```ts
  import { sanitize } from '../utils/audit-sanitize'
  ```
  Do **not** touch line 47 (`const details = sanitize(req.body)`) or anything in the `if (ctx.plane === 'platform')` / `else` branches (lines 50–71) — the call site and both branches are unchanged, only the implementation's location moves. Confirm after editing that `sanitize()` is still invoked exactly once, unconditionally, before the plane branch — this is the F1.2 guarantee.

- [x] **Step 4: `scrub-audit-secrets.ts` imports the same util**

  Delete its local `SENSITIVE_KEY_PATTERN`/`redact` (lines 23,25–35), replace with:
  ```ts
  import { redact } from '../utils/audit-sanitize'
  ```
  Leave the rest of the script (the `main()` scrub loop, logging, ops-note comments) untouched.

- [x] **Step 5: Enforce redaction inside `platform-audit.repository.ts`**

  In `createPlatformAuditLog()` (lines 71–81), import `redact` from the new util and apply it to `entry.details` before writing:
  ```ts
  import { redact } from '../utils/audit-sanitize'
  // ...
  export function createPlatformAuditLog(entry: PlatformAuditEntry) {
    return prisma.platformAuditLog.create({
      data: {
        performedByPlatformUserId: entry.performedByPlatformUserId,
        action:                    entry.action,
        targetTenantId:            entry.targetTenantId ?? null,
        details:                   (entry.details != null ? redact(entry.details) : undefined) as Prisma.InputJsonValue | undefined,
        ipAddress:                 entry.ipAddress ?? null,
      },
    })
  }
  ```
  This is the defense-in-depth layer: every write through the repo function is now redacted regardless of caller.

- [x] **Step 6: Refactor the 8 direct call sites to go through the repo function**

  For each of the 3 services, import the repo and replace the inline `prisma.platformAuditLog.create({ data: {...} })` with `platformAuditRepo.createPlatformAuditLog({...})` (same field values, no `data:` wrapper):

  `platform-plans.service.ts` — add `import * as platformAuditRepo from '../models/platform-audit.repository'` alongside the existing imports (line ~14); replace the 3 call sites:
  - Line 133 (`plan.create`): `await platformAuditRepo.createPlatformAuditLog({ action: 'plan.create', targetTenantId: null, performedByPlatformUserId: performedById, details: { planId: plan.id, key: plan.key, name: plan.name } })`
  - Line 156 (`plan.update`): same pattern with `action: 'plan.update'`, `details: { planId: id, changes: JSON.parse(JSON.stringify(data)) }`
  - Line 181 (`plan.delete`): same pattern with `action: 'plan.delete'`, `details: { planId: id, key: plan.key, name: plan.name }`

  `platform-customers.service.ts` — add the same import; replace 4 call sites (lines 190, 236, 264, 288) preserving each one's exact `action`/`targetTenantId`/`details` values (`customer.create`, `customer.update`, `tenant.suspend`, `tenant.reactivate`).

  `platform-provisioning.service.ts` — add the same import; replace the 1 call site (line 114, `provisioning.update`), preserving its `details: { updatedFields: [...] }` value.

  The `prisma` import stays in all 3 files (still used elsewhere for non-audit queries — e.g. `prisma.tenant.findUnique` in `platform-customers.service.ts`).

- [x] **Step 7: Tighten the `features` schema in `platform-plans.controller.ts`**

  Change both `createPlanSchema` (line 23) and `updatePlanSchema` (line 33):
  ```ts
  features: z.record(z.boolean()).optional(),
  ```
  (from `z.record(z.unknown())`). Seeded plans all use `{}` — no seed breakage per ADR.

- [x] **Step 8: Run the regression test (green)**

  Re-run the test added in Step 1 — it must now pass (the plan-update path writes through the redacting repo function).
  ```bash
  cd src/backend && node node_modules/jest/bin/jest.js auditRedaction --runInBand --forceExit
  ```

- [x] **Step 9: Re-run `scrub-audit-secrets.ts` once against the dev DB, capture output**
  ```bash
  cd src/backend && npx ts-node scripts/scrub-audit-secrets.ts
  ```
  Capture the printed `Scrubbed N of M platform_audit_logs rows.` line in the task's completion notes (expect `0 of M` if Batch 3's original scrub already ran clean — this is a re-run for defense-in-depth confirmation, not expected to find anything new).

  **Result:** `Scrubbed 2 of 6210 platform_audit_logs rows.` — 2 pre-existing dev-DB rows had plaintext secret-like keys and were redacted by this re-run; confirms the scrub path still functions correctly post-refactor (not a regression — these rows predate this batch's fix and were caught by the existing standalone scrub logic, now sourced from the shared `audit-sanitize.ts` util).

- [x] **Step 10: Full backend suite**
  ```bash
  cd src/backend && node node_modules/jest/bin/jest.js --runInBand --forceExit
  ```
  Expect 832 + 1 new test passing (833 total), zero failures.

  **Result:** 833 passed, 0 failed.

- [x] **Step 11: Commit (includes ADR-0007 + this plan file per task brief)**
  ```bash
  git add docs/adr/0007-codex-audit-batch5-reaudit-fixes.md docs/superpowers/plans/2026-07-08-codex-audit-batch5a.md src/backend/utils/audit-sanitize.ts src/backend/middlewares/audit.middleware.ts src/backend/scripts/scrub-audit-secrets.ts src/backend/models/platform-audit.repository.ts src/backend/services/platform-plans.service.ts src/backend/services/platform-customers.service.ts src/backend/services/platform-provisioning.service.ts src/backend/controllers/platform-plans.controller.ts src/backend/tests/integration/auditRedaction.test.ts
  git commit -m "$(cat <<'EOF'
  fix(platform-audit): close direct-service redaction gap, add sanitize choke point (ADR-0007 D1, grill F1.2)

  8 direct prisma.platformAuditLog.create call sites bypassed audit redaction
  entirely; refactored to go through the repository function, which now
  redacts unconditionally. audit.middleware.ts's sanitize() call is unchanged
  and still fires for both clinic and platform branches (grill F1.2) -- this
  is additive defense-in-depth, not a removal. Tightened plan `features` to
  z.record(z.boolean()) per ADR-0003 D3 alignment.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 2 (ADR D2): Company-type customer-detail contract fix

**Files:**
- Modify: `src/backend/services/platform-customers.service.ts` (add `companyTypeId` scalar to `CustomerDetail`)
- Modify: `src/frontend/src/hooks/usePlatformCustomers.ts` (add `companyTypeId` to the frontend `CustomerDetail` interface)
- Modify: `src/frontend/src/views/platform/CustomerDetailView.tsx` (remove the `as` cast; fix company-type picker label)
- Modify: `src/backend/tests/integration/platformContract.test.ts` (or a new backend integration test file — round-trip regression, grill FX.1)

**Verified facts (this session):**
- Backend `CustomerDetail` interface (`platform-customers.service.ts:51-61`) exposes `companyType: { id, key, nameEn, nameTh } | null` (nested) but no scalar `companyTypeId`. `toDetailItem()` (lines 77-101) already has `row.companyTypeId` available (it's on `TenantWithPlanAndQuota` per the repository's `companyTypeId: true` select at `platform-customers.repository.ts:93`) — the DTO fix is additive, no new query needed.
- Frontend hook's separate `CustomerDetail` interface (`usePlatformCustomers.ts:22-30`) also has no `companyTypeId` field at all.
- `CustomerDetailView.tsx:60` does `setEditCompanyTypeId((customer as { companyTypeId?: number | null }).companyTypeId ?? null)` — an `as` cast to a shape not actually present on either DTO, so this always evaluates to `undefined ?? null` today (silently broken pre-population of the edit form).
- Company-type picker (`CustomerDetailView.tsx:36`) declares a local `CompanyType { id, key, label }` interface, but the real `/platform/company-types` response (`platform-company-type.controller.ts` `handleListCompanyTypes` → `companyTypeService.listCompanyTypes()`) returns `{ id, key, nameEn, nameTh, sortOrder, isActive }` — there is no `label` field, so `ct.label` at line 106 always renders blank. This is the "unrelated, separate options-endpoint bug" ADR D2 calls out.
- `platformContract.test.ts` is schema-only today (no DB/app fixtures) — the round-trip test needs `request`/`app`/`prisma`/`signPlatformToken` fixtures like `auditRedaction.test.ts` has. Per grill FX.1, add these fixtures locally in `platformContract.test.ts` (or create a new integration test file if that's cleaner given the file's current schema-only nature) — either way, it must NOT touch `PlatformConsole.test.tsx`.

- [ ] **Step 1 (TDD, red): write the failing round-trip regression test first (grill FX.1 — backend suite only)**

  In `platformContract.test.ts`, add a new `describe('platform contract — company-type round-trip (D2, grill FX.1)', ...)` block with its own minimal `beforeAll`/`afterAll` fixture (platform token + a tenant with a seeded/created company type — reuse `auditRedaction.test.ts`'s fixture pattern for the platform token and tenant creation, do not import from that file, keep this file's fixtures self-contained):
  - Create a company type via `POST /platform/company-types` (or seed one directly via `companyTypeRepo`).
  - Create a customer/tenant with that `companyTypeId` set.
  - `PUT /platform/customers/:id` with an unchanged payload (e.g. same `name`, same `companyTypeId`).
  - `GET /platform/customers/:id`, assert the response's `data.companyTypeId` equals the original value (proves the DTO round-trips the scalar and the update didn't silently clear it).
  - Run it now — it must **fail** (today's `CustomerDetail` DTO has no `companyTypeId` key at all, so the assertion has nothing to read).

- [ ] **Step 2: Add `companyTypeId` scalar to the backend `CustomerDetail` DTO**

  In `platform-customers.service.ts`, add the field to the interface (line 51-61) and populate it in `toDetailItem()` (line 77-101):
  ```ts
  export interface CustomerDetail extends CustomerListItem {
    maxBranches:   number | null
    maxUsers:      number | null
    maxOwners:     number | null
    email:         string | null
    phone:         string | null
    address:       string | null
    logoUrl:       string | null
    companyTypeId: number | null
    // D-2-06: company type detail (null if not assigned)
    companyType:   { id: number; key: string; nameEn: string; nameTh: string } | null
  }
  ```
  And in `toDetailItem()`, add `companyTypeId: row.companyTypeId,` alongside the existing `companyType: row.companyType ?? null,` line.

- [ ] **Step 3: Add `companyTypeId` to the frontend hook's `CustomerDetail` interface**

  In `usePlatformCustomers.ts` (lines 22-30), add:
  ```ts
  export interface CustomerDetail extends Customer {
    email:         string | null
    phone:         string | null
    address:       string | null
    logoUrl:       string | null
    maxBranches:   number | null
    maxUsers:      number | null
    maxOwners:     number | null
    companyTypeId: number | null
  }
  ```

- [ ] **Step 4: Remove the `as` cast in `CustomerDetailView.tsx`**

  Change line 60 from:
  ```ts
  setEditCompanyTypeId((customer as { companyTypeId?: number | null }).companyTypeId ?? null)
  ```
  to:
  ```ts
  setEditCompanyTypeId(customer.companyTypeId ?? null)
  ```
  Now type-safe against the updated `CustomerDetail` interface from Step 3 — no cast needed.

- [ ] **Step 5: Fix the company-type picker label (separate options-endpoint bug, same file)**

  Change the local interface (line 36) to match the real API shape:
  ```ts
  interface CompanyType { id: number; key: string; nameEn: string; nameTh: string }
  ```
  Change the render at line 106 from `{ct.label}` to a computed label, `nameTh || nameEn || key` per ADR D2:
  ```tsx
  {companyTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.nameTh || ct.nameEn || ct.key}</option>)}
  ```

- [ ] **Step 6: Run the regression test (green)**
  ```bash
  cd src/backend && node node_modules/jest/bin/jest.js platformContract --runInBand --forceExit
  ```

- [ ] **Step 7: Full backend + frontend suites**
  ```bash
  cd src/backend && node node_modules/jest/bin/jest.js --runInBand --forceExit
  ```
  Expect 833 (post-T1) + 1 new test = 834 passing, zero failures.
  ```bash
  cd src/frontend && npm test -- --run
  ```
  Expect 143 passing, zero failures — T2 does not add or modify a frontend test file (`usePlatformCustomers.test.ts` only tests `UpdateCustomerPayload`, untouched by this task's DTO addition to `CustomerDetail`; confirmed no `PlatformConsole.test.tsx` conflict since D2's test is backend-only per FX.1).

- [ ] **Step 8: Commit**
  ```bash
  git add src/backend/services/platform-customers.service.ts src/frontend/src/hooks/usePlatformCustomers.ts src/frontend/src/views/platform/CustomerDetailView.tsx src/backend/tests/integration/platformContract.test.ts
  git commit -m "$(cat <<'EOF'
  fix(platform-customers): add companyTypeId scalar to detail DTO, remove unsafe cast (ADR-0007 D2, grill FX.1)

  CustomerDetailView.tsx read companyTypeId via an `as` cast because neither
  the backend DTO nor the frontend hook type exposed the scalar (only the
  nested companyType object existed). Added companyTypeId to both, removed
  the cast, and fixed the separate company-type picker label bug (nameTh ||
  nameEn || key -- the options endpoint has no `label` field). Round-trip
  regression test lives in the backend integration suite (platformContract),
  not PlatformConsole.test.tsx, per grill FX.1 (avoids conflict with 5B's D6c).

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 3: Final verification

- [ ] **Step 1: Run the full backend suite**
  ```bash
  cd src/backend && node node_modules/jest/bin/jest.js --runInBand --forceExit
  ```
  Expect **834** tests passing (832 baseline + 2 new: D1's plan-update redaction test, D2's round-trip test), zero failures.

- [ ] **Step 2: Run the full frontend suite**
  ```bash
  cd src/frontend && npm test -- --run
  ```
  Expect **143** tests passing (unchanged — T2 touches no frontend test file), zero failures.

- [ ] **Step 3: Grep sweep — no remaining direct `prisma.platformAuditLog.create` calls outside the repository**
  ```bash
  grep -rn "prisma.platformAuditLog.create" src/backend/services src/backend/controllers
  ```
  Expected: no output (all 8 sites now go through `platformAuditRepo.createPlatformAuditLog`).

- [ ] **Step 4: Grep sweep — no remaining `as { companyTypeId` cast**
  ```bash
  grep -n "as { companyTypeId" src/frontend/src/views/platform/CustomerDetailView.tsx
  ```
  Expected: no output.

- [ ] **Step 5: Confirm `RecomendByCodex/`, `.claude/roadmap/ACTIVE/*`, and the 5B doc-drafts were never staged**
  ```bash
  git log --stat fix/codex-audit-batch5a-security -- RecomendByCodex .claude/roadmap/ACTIVE .claude/specs/implementation-status-matrix.md CLAUDE.md README.md .claude/skills
  ```
  Expected: no output.

- [ ] **Step 6: Confirm commit order and count**
  ```bash
  git log --oneline fix/codex-audit-batch5a-security
  ```
  Expected: 2 commits (T1 → T2), with ADR-0007 and this plan file included in T1's diff (per the task brief: "First commit includes ADR-0007 + plan file").

- [ ] **Step 7: Hand off**

  Hand off to `@ponytail-agent` (Step 5 gate) before `/execute-plan`, then `@qa-agent` (Step 7) for sign-off — QA's focus this batch: confirm the two regression tests actually exercise the direct-service (non-middleware) path (D1) and the DTO round-trip (D2), not just that they pass; confirm the grep sweeps above; confirm F1.2 (clinic-plane redaction still intact — spot-check the existing `audit redaction — clinic plane` describe block in `auditRedaction.test.ts` still passes unmodified). Then `/anemal-finish-branch` (Step 8, which invokes `/anemal-HTML-updater` as its last act) — note in the PR description that this is 5A of a two-part batch (5B tracked separately, independent scope, no shared files).
