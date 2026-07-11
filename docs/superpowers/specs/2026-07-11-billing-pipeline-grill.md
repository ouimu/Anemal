# Grill — Item 3: Billing Pipeline (Step 3.5, MANDATORY)

Date: 2026-07-11. Autonomous scheduled run (no human present) — interview conducted by re-verifying every load-bearing claim against live source rather than trusting the tasks.md prose, per grilling skill intent.

Input: `docs/superpowers/specs/2026-07-11-billing-pipeline-tasks.md` (10 tasks, BA sign-off GRANTED-WITH-CORRECTIONS).

## Claims re-verified directly (not just re-read)

- **`fontkit` availability (T-3a.1):** confirmed installed and resolvable — `node -e "require.resolve('fontkit')"` → `src/backend/node_modules/fontkit/dist/main.cjs`. Task's "already a transitive dep, don't add new one" claim holds.
- **`performedBy` write path is same-tenant by construction (T-3d.2 tenant-scoping claim):** confirmed — `hospitalization.controller.ts:35` calls `svc.logCare(req.context!.tenantId, ..., req.context!.userId)`. `performedBy` is always the authenticated JWT `userId`, never client-supplied. The FK having no independent tenant check is safe for this reason, as the task asserted — verified, not assumed.

## Findings

### F1 — 3a: prescription PDF shares the broken font but has no coverage test (RESOLVED)
`generatePrescriptionPdf` (`pdf.service.ts:166-237`) uses the same `'NotoThai'` font registration as the invoice path. T-3a.2 as written only smoke-tests `generateInvoicePdf`. The font-file swap (T-3a.1) fixes both code paths, but nothing proves the prescription path was checked.
**Resolution:** T-3a.2 scope widened to also smoke-test `generatePrescriptionPdf` with a Thai+Latin+digit prescription (same assertions: non-empty buffer, starts with `%PDF`, no throw). Applied directly to tasks.md (see amendment below) — zero new files, one more assertion block in the same test.

### F2 — 3b: reused modal must not carry post-sale "success" framing when opened from history (RESOLVED)
`SuccessModal` today is shown only immediately after finalizing a sale and includes celebratory copy ("Payment successful!" / earned-amount messaging, `ClinicBilling.tsx:574-635`). T-3b.2 extracts the receipt body into `ReceiptModal` and keeps `SuccessModal` as a thin wrapper — the split already exists in the plan, but the AC for T-3b.3 didn't explicitly forbid success-only copy leaking into the history-triggered `ReceiptModal`.
**Resolution:** Added an explicit AC line to T-3b.3: "the modal opened from a history row shows only receipt content (invoice #, lines, totals, method, Print/PDF) — no success banner, no 'earned' messaging." Test proves done: assert `ReceiptModal` rendered from history does not render the success-banner text/testid used by `SuccessModal`.

### F3 — 3c: `receivedByOptions` faceted by the active date/branch filter is a real UX behavior, not a bug — documented, no code change (RESOLVED, no action)
T-3c.2 derives receiver options from the same `where` minus `receivedById`/`method` — meaning as the user narrows the date range, the receiver dropdown's option list can shrink (a receiver with no payments in the narrowed range disappears from the picker). This is standard faceted-filter behavior (matches how the existing Method filter would behave if similarly scoped) and is preferable to showing stale options that yield 0 rows — no change needed, but AC-3c gains a clarifying line so QA doesn't mistake it for a bug: "receiver options reflect the currently active date/branch scope; narrowing dates may shrink the list — this is intended, not an error."

### F4 — 3d: no additional gap found beyond what BA already covered (RESOLVED, no action)
Verified the two load-bearing claims above; migration orphan-cleanup + `ON DELETE SET NULL` sequencing in T-3d.1 is correct order (cleanup before constraint add, standard Postgres pattern). No further findings.

## Findings resolved — write-plan unblocked

All 4 findings resolved directly (2 as task-doc amendments below, 2 as documentation-only clarifications, 0 filed to backlog, 0 blocking). No unresolved findings remain.

## Amendments applied to `2026-07-11-billing-pipeline-tasks.md`

- T-3a.2: widened to cover `generatePrescriptionPdf` in addition to `generateInvoicePdf`.
- T-3b.3 / AC-3b: added explicit "no success-banner copy when opened from history" requirement + test.
- AC-3c: added clarifying line on faceted receiver-options behavior (documentation only).
