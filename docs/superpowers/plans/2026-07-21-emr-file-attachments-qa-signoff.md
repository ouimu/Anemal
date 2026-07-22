# QA Sign-off — EMR File Attachments (presign → PUT → confirm S3 flow)

- **Document type:** Step-7 QA sign-off (CLAUDE.md Standard Pipeline)
- **Branch:** `feature/emr-file-attachments`
- **PR:** #41
- **Author:** @qa-agent (code review + protocol verification from source)
- **Date:** 2026-07-22
- **Refs:** ADR-0021, plan `docs/superpowers/plans/2026-07-21-emr-file-attachments.md`,
  test file `src/backend/__tests__/emr-attachments.test.ts` (EA-01..EA-21)

## Verdict: ✅ APPROVE

Security enforcement verified present and correct from source on all four new routes.
No P1/P2 findings. No code changes required. Three non-blocking P3 coverage
observations and one residual gate item recorded below.

## Routes reviewed (`src/backend/routes/medical-record.routes.ts`)

| Route | Plane guard | Permission guard | Extra guards (service) |
|---|---|---|---|
| `POST /:id/attachments/presign` | `requirePlane('clinic')` | `requirePermission('emr.attach')` | tenant/branch-scoped `getMedicalRecord` (404 leak precedent) → storage-config 503 → server-generated UUID key |
| `POST /:id/attachments` (confirm) | `requirePlane('clinic')` | `requirePermission('emr.attach')` | XOR `fileUrl`/`storageKey` + `assertStorageKeyPrefix` + MIME allow-list enum |
| `GET /:id/attachments/:attId/download` | `requirePlane('clinic')` | `requirePermission('emr.view')` | tenant+record-scoped `findAttachmentById` (404) + `Content-Disposition: attachment` |
| `DELETE /:id/attachments/:attId` | `requirePlane('clinic')` | `requirePermission('emr.attach')` | billed-record BR-6 guard (403) + tenant+record-scoped lookup (404) |

## Six-point QA verification (from source)

1. **Tenant isolation** — PASS. `findById`, `findAttachmentById`, `deleteAttachmentById`
   are all scoped by `{ tenantId, medicalRecordId }`; `createAttachment` writes `tenantId`.
   Foreign-tenant record → 404 (EA-05), foreign attachment id → 404 (EA-17). No
   `findUnique({ id })`-only lookup on any read/mutate path.
2. **RBAC enforcement is DB-permission-based, not JWT-claim-based** — PASS. EA-16 proves a
   token signed `role:'staff'` is still 403'd when its effective role (via `user_roles →
   role_permissions`) lacks `emr.view`. `emr.attach` holders: doctor/clinic_staff/clinic_admin
   (EA-01/02/03/20), matching the live `seed-rbac.ts` (ADR-0021 A1 correction confirmed).
3. **Billed-record delete guard (BR-6)** — PASS. `deleteAttachment` checks
   `record.invoices.some(paymentStatus === 'paid')` → 403 before deletion; row survives (EA-19).
   Mirrors `updateMedicalRecord`'s existing freeze semantics.
4. **MIME allow-list** — PASS. Single source of truth `emr-attachment.constants.ts`; enforced by
   Zod enum on **both** presign (`contentType`) and confirm (`mimeType`). SVG (EA-06) and
   text/html (EA-14) rejected. Excludes SVG/HTML active-content, executables, archives.
5. **Storage-key prefix / path-traversal / IDOR** — PASS. `sanitizeFilename` collapses every char
   outside `[a-zA-Z0-9._-]` to `_`, so no `/` or `..` survives into the server-generated key
   (`tenants/{tid}/emr/{rid}/{uuid}-{safe}`). Confirm enforces `assertStorageKeyPrefix` (EA-13
   forged `tenants/99999/...` → 400 INVALID_STORAGE_KEY). A prefix-passing `..` string cannot
   escape scope: S3 keys are opaque literals (no normalization), and the object must first have
   been PUT via a clean-key presign.
6. **Standard dimensions (security/correctness/error-envelopes/maintainability)** — PASS.
   Consistent `{ success, data }` / `{ success:false, code }` envelopes; storage-not-configured
   → 503 (EA-08); XOR + neither/both validation (EA-11/12); audit rows on presign/confirm/delete
   (EA-21); best-effort S3 delete with documented orphan acceptance (R7/F4).

## Test results (observed this session)

| Suite | Result |
|---|---|
| `npx jest --testPathPattern=emr-attachments --runInBand` | **21 passed / 21** (EA-01..EA-21), 3.2 s |
| Backend full suite (reported by launching agent, not re-run) | 1058 / 1058 |
| Frontend full suite (reported) | 289 / 289 |
| `tsc --noEmit` both sides (reported) | clean |

## Non-blocking observations (P3 — do not block sign-off)

- **P3-1 — Deny-path coverage on presign/confirm/delete.** EA-16 proves the 403 deny path on the
  `emr.view`-gated download route. The `emr.attach`-gated presign/confirm/delete routes use the
  identical shared `requirePermission` middleware but have no dedicated 403-deny test. Redundant
  against proven shared middleware; optional to add for symmetry with the must-test matrix.
- **P3-2 — Plane isolation not asserted for these routes.** No test sends a platform-plane token
  to these clinic routes to assert 403. `requirePlane('clinic')` is shared, independently-tested
  middleware; low risk. Optional regression lock.
- **P3-3 — Untested minor branches.** Download of a legacy `fileUrl`-only attachment → 400
  ("URL reference, not a stored file") and download when storage unconfigured → 503 are handled
  in code but not asserted.

## Protocol 5 browser smoke (executed post-approval, 2026-07-22)

Ran against local dev servers (backend :4000, frontend :5173, `vetclinic-pg` Docker) as
`doctor_a` / `dev-clinic` (role `doctor`, holds `emr.attach`+`emr.view` per matrix above):

1. Logged in, selected Downtown Branch, landed on dashboard — no console errors.
2. Navigated EMR → searched patient "nong" → selected pet "Thongdaeng" → started new record,
   entered a note, saved. Record persisted (`Saved` indicator, date stamp appeared).
3. Attachments panel rendered with working Upload control, gated correctly (visible/enabled for
   an `emr.attach`-holding role, matching route guard).
4. Triggered a file selection (jpg) → presign call fired → **503 "Request failed with status
   code 503"** surfaced cleanly in the UI, no crash/white-screen. This is `STORAGE_NOT_CONFIGURED`
   (S3 creds absent in local dev — the same "needs credentials" constraint already tracked for
   Phases 10/11 in CLAUDE.md), not an app defect. It confirms the presign→error path is wired
   and error states render gracefully (EA-08 covers this server-side; this confirms the client
   side).

Full upload→PUT→confirm→download→delete round-trip requires real S3 credentials, unavailable in
this environment — same infra gap as the rest of the payment/dispatch phases. Everything
verifiable without S3 (auth, routing, permission-gating, save-then-attach flow, error handling)
passed. Gate satisfied for what's locally verifiable; full E2E storage round-trip is deferred to
an environment with S3 configured (tracked under Infra F2 below, not a merge blocker).
- **Infra F2 (ADR-0021).** S3 bucket policy must restrict public read on the `tenants/*/emr/*`
  prefix. App-level access control is correct regardless; this is an ops follow-up, not a code
  blocker.
- **Declared-MIME vs magic-bytes.** In a presign/direct-to-S3 flow the server never sees the
  bytes, so magic-byte inspection (qa-protocols §1) is not achievable server-side. Mitigated by
  binding `ContentType` into the signed PUT + forcing `Content-Disposition: attachment` on
  download. Reasonable architectural residual.

## Sign-off

**QA-Agent Approval: ✅ APPROVE.** Backend security posture (tenant isolation, RBAC on
`emr.attach`/`emr.view`, billed-record delete guard, MIME allow-list, storage-key prefix /
path-traversal / IDOR closure) verified correct from source with 21/21 observed green. No open
`/code-review` P1/P2 findings. Proceed to Protocol 5 browser smoke, then Step 8.
