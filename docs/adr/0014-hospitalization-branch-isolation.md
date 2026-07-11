# ADR-0014: Hospitalization branch isolation (BOLA fix) — grilling resolutions

## Status
Accepted

## Context

`hospitalization.controller.ts` / `.service.ts` / `.repository.ts` scope single-record
operations (`getHospitalization`, `edit`, `remove`, `logCare`) by `tenantId` only. A
branch-scoped staffer holding `inpatient.view`/`inpatient.manage` can read/edit/delete/
log-care/discharge another branch's admission in the same tenant by guessing the numeric
ID (OWASP API1:2023 BOLA). `listActive` additionally trusts `req.query.branchId` over
`req.context.branchId`.

Full evidence, threat model, and authorization contract: `RecommendByCodex/03-hospitalization-branch-isolation.md`.
Delivery order and "must not do" list: `RecommendByCodex/04-claude-execution-guide.md`.

This ADR is the mandatory Step 3.5 (`/grill-with-docs`) output — it resolves the four
gate questions the execution guide flagged as blocking `/write-plan`.

## Grilling: gate questions and resolutions

**Q1 — Does an all-branch admin session (`branchId` null/undefined in token) read every
branch's hospitalization records via `GET /:id` and `GET /active`?**

Resolved: **Yes, unchanged.** The spec's authorization contract is explicit —
`branchId` null/undefined means "all-branch session, do not add branch predicate."
`medical-record.repository.ts` (`findById`, `findByPet`, `countByPet`) already implements
exactly this pattern: `...(branchId != null ? { branchId } : {})`. Today's hospitalization
code has *zero* branch enforcement for reads, so an admin session already sees everything;
this fix must close the branch-scoped-staff gap without regressing admin's existing
capability. Applying the same conditional predicate achieves both.

**Q2 — Must an admin/all-branch session select a concrete branch before mutating
(`PUT /:id`, `DELETE /:id`, `POST /:id/care`) or discharging (`PUT /:id/discharge`)?**

Resolved, split by operation, on evidence of two competing codebase conventions:

- `product.controller.ts`, `prescription.controller.ts`, `invoice.controller.ts` all call
  `requireBranchId(req)` (throws if no concrete branch) for *creating new branch-scoped
  resources* (stock movements, prescriptions, invoices).
- `medical-record.repository.ts` uses the null-tolerant `!= null` predicate for *reads and
  updates of existing records*.

Edit/delete/log-care operate on an **existing** admission, not a new branch-scoped
resource — so they follow the medical-record convention: **no concrete-branch requirement
added; admin with `branchId` null/undefined may edit/delete/log-care any branch's
admission, exactly as today (today there is no enforcement at all, so this is not a
capability reduction).**

Discharge is different: `hospitalization.controller.ts:40` already calls
`requireBranchId(req)` today, because discharge creates an invoice
(`invoice.service.createInvoice` requires a concrete `branchId`, matching
`invoice.controller.ts:28`'s own `requireBranchId` call). **This existing requirement is
preserved unchanged** — it predates this fix and is orthogonal to the BOLA gap (it already
throws before any branch-isolation logic runs). No new restriction is introduced.

**Q3 — Is `branchId = null` allowed on new admissions (`POST /`), or should it be banned?**

Resolved: **Out of scope for this fix, left unchanged.** `admit()` already accepts
`branchId: number | null` from `req.context?.branchId ?? null` and this PR does not touch
`admit`/`POST /`. The spec explicitly flags this as a "should open as follow-up" item, not
a blocking requirement for the BOLA patch. Recorded here so it isn't silently dropped:
**follow-up candidate** — decide whether admission should require a concrete branch,
tracked in `.claude/roadmap/ACTIVE/remaining-tasks.md` after this PR ships.

**Q4 — Does `GET /active`'s `?branchId=` query param have any legitimate consumer today?**

Resolved: **No.** Grepped the frontend (`ClinicInpatient.tsx:588`) — the only caller is
`api.get('/api/hospitalizations/active')` with no query params at all. There is no admin
branch-filter UI consuming this parameter. It is dead and actively dangerous (it lets a
branch-scoped session override its own session branch). **Decision: remove the query
override entirely for branch-scoped sessions.** For all-branch/admin sessions with no
`req.context.branchId`, no filter is applied by default (matches Q1); no optional
admin-filter query param is (re)introduced in this patch since nothing consumes it —
adding one would be speculative scope creep per the Ponytail gate.

## Decision

1. `branchId` for every single-record hospitalization operation (`getHospitalization`,
   `edit`, `remove`, `logCare`, `discharge`) is derived **only** from `req.context.branchId`
   (verified JWT), inserted as a **required positional parameter before `id`** in every
   service/repository signature down the call chain, including the post-write re-fetch
   callbacks inside `update()` and `markDischarged()` (both currently call an unscoped
   `findById`).
2. Repository predicate for all listed functions: `where: { id, tenantId, ...(branchId != null ? { branchId } : {}) }`
   — explicit `!= null`, never a truthy check (fixes `findActive`'s existing `branchId ? {...} : {}` bug too).
3. Cross-branch-same-tenant access returns 404 (matches existing tenant-isolation
   precedent — `medical-record`, `appointment`, `invoice` repositories all return 404 for
   scope misses, never 403, to avoid confirming object existence).
4. `GET /active` ignores/rejects `req.query.branchId` for branch-scoped sessions; uses
   `req.context.branchId` unconditionally. No admin query-filter param is added.
5. Discharge's existing `requireBranchId(req)` call is untouched.
6. `admit`/`POST /` is untouched; `branchId = null` admissions remain allowed pending a
   separate follow-up decision.
7. No new endpoint, permission, migration, or dependency.

## Consequences

- Branch-scoped staff can no longer read or mutate another branch's admission by ID
  guessing (closes the BOLA).
- All-branch/admin capability is unchanged in every operation, including discharge (whose
  branch requirement predates and is independent of this fix).
- `admit` retains its existing `branchId = null` allowance — tracked as an explicit,
  intentional non-fix, not an oversight, via the remaining-tasks backlog.
- `GET /active?branchId=` becomes inert for branch-scoped sessions (no behavior change for
  the only real caller, which never sent the param).

## Glossary additions

- **BOLA (Broken Object Level Authorization):** OWASP API1:2023 — a user has permission to
  call an endpoint/function but not to act on the specific object referenced by its ID.
  Fixed by enforcing object-level scope (tenant + branch) in the data-access layer, not
  just the permission-guard layer.
- **Branch scope (`BranchScope = number | null | undefined`):** the authorization
  contract used across `medical-record`, `appointment`, `invoice`, and (as of this ADR)
  `hospitalization` repositories. `number` = record must belong to that branch; `null`/
  `undefined` = all-branch session, no branch predicate applied. Always derived from
  `req.context`, never from request body/path/query for single-record operations.
