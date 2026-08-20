# ADR-0025 — Payment claim failure distinguishes not-found from conflict

**Status:** Accepted
**Date:** 2026-08-20
**Related:** ADR-0019 (single role per user), HI-02 / HI-08 (PR #53 security fixes)
**Origin:** `/grill-with-docs` Step 3.5 gate —
`docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019-grill.md`

## Context

`PUT /api/invoices/:id/payment` claims an invoice as paid through a single
atomic statement (`models/invoice.repository.ts`, `claimInvoicePaid`):

```ts
const claimed = await tx.invoice.updateMany({
  where: { id, tenantId, ...(branchId != null ? { branchId } : {}), paymentStatus: { not: 'paid' } },
  data: { paymentStatus: 'paid', paymentMethod, paidAt: new Date() },
})
if (claimed.count !== 1) throw new ConflictError('Invoice is already paid', 'INVOICE_ALREADY_PAID')
```

The single-statement claim is deliberate (HI-08): it closes the race between
checking an invoice's payment state and writing it, so an invoice cannot be paid
twice by concurrent requests.

But `count !== 1` conflates four distinct causes — already-paid in the caller's
own scope, wrong tenant, wrong branch within the right tenant, and an id that
does not exist at all — and reports every one as `409 INVOICE_ALREADY_PAID`.

The integration test `bill-09: tenant B cannot pay tenant A invoice → 404` has
been failing on `main` since PR #53. The test is correct; the code is wrong. The
sibling read path (`bill-08`) correctly returns 404 for the same cross-tenant
case, so the two halves of the same resource disagree.

Data isolation was never at risk: the claim is tenant+branch scoped, matches zero
rows for a foreign caller, writes nothing, and throws before any read. And
because all four causes returned the same 409, there was no cross-tenant
existence oracle either. The defect is an API-contract one — a caller cannot
distinguish "already paid" from "not found" — plus a detection gap: a
cross-tenant probe logged identically to a benign double-tap on a tablet.

## Decision

**`409` may only ever describe an invoice inside the caller's own tenant+branch
scope. Everything else is `404`.**

| Case | Status |
|---|---|
| wrong tenant | `404` |
| wrong branch, same tenant | `404` |
| nonexistent id | `404` |
| already paid, caller's own scope | `409 INVOICE_ALREADY_PAID` |

Three constraints make this safe, and they are load-bearing rather than
stylistic:

1. **The existence check that distinguishes 404 from 409 MUST use the identical
   tenant+branch scope as the atomic claim** — never wider. An unscoped check
   would answer "exists but not claimable" for a foreign invoice, producing a
   working cross-tenant existence oracle on a money endpoint. That would be
   strictly worse than the bug being fixed, while looking like a correct patch in
   review.
2. **It MUST run only on the `count === 0` path.** Hoisting it into a pre-check
   would reintroduce the exact TOCTOU race HI-08's single-statement claim closes.
3. **`409` is the only status that reveals anything**, and what it reveals is
   confined to the caller's own data.

## Consequences

**Positive**
- The payment path now agrees with the read path on cross-tenant requests.
- Clients can distinguish "already paid" from "not found" and surface the right
  message.
- The detection gap closes without separate audit-logging work: cross-tenant
  probes are no longer indistinguishable from benign double-taps in logs.
- Isolation is unchanged and remains verified by `bill-08` and `bill-09`.

**Negative / risks**
- The status code for a not-visible invoice changes from `409` to `404`. No
  client depends on the old behaviour — every frontend `409` handler is in the
  roles/admin area (`RoleList.tsx`, `useRoles.ts`, `ClinicAdminsTab`), none in
  invoice payment — but an external integration built against the old response
  would see the change.
- The no-oracle property is a **security invariant**, not an incidental detail.
  Any future change that widens the failure-path lookup — dropping the branch
  clause, reusing a generic `findInvoiceById`, or adding an early existence
  guard — silently reintroduces the oracle. Tests must cover all four rows of the
  table above, not only the cross-tenant one, so a partial fix that special-cases
  tenant mismatch cannot pass.

**Out of scope (backlog)**
- Audit logging for repeated payment-probe failures.
- `services/role.service.ts:184` `countRoleUsage(roleId)` is not tenant-scoped.
  The live path is guarded by the `role.tenantId !== tenantId` check above it, so
  this is defence-in-depth — but it also means a wrong-tenant test fixture would
  still trigger the 409 and pass while asserting nothing about scoping.
