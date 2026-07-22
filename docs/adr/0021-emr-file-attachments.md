# ADR-0021: EMR File Attachments (real upload, replaces URL-reference-only)

**Date:** 2026-07-21
**Status:** Accepted
**Context:** Scheduled feature build — EMR file attachments. Design spec:
`docs/superpowers/specs/2026-07-21-emr-file-attachments-brainstorm.md` +
`docs/superpowers/specs/2026-07-21-emr-file-attachments-design.md` (BA sign-off).
**Grill:** Step 3.5, run autonomously (no human present) per CLAUDE.md scheduled-task protocol.
Self-interviewed against the design doc, verified against the real `upload.service.ts`,
`config/storage.ts`, and `medical-record.service.ts` code. Findings below.

## Context

`POST /api/medical-records/:id/attachments` only accepts a URL reference
(`{fileName, fileUrl, fileType}`) — no binary ever reaches clinic storage, and
`ClinicEMR.tsx`'s Attachments panel has no upload control at all. The BA design
(companion docs) proposes a presign → direct-to-S3-PUT → confirm flow, a new
EMR-scoped presign route (the existing `/api/upload/presign` is gated `crm.edit`,
which doctors don't hold, and lacks PDF/DOCX support and a size cap), and flagged
two open questions for the grill.

## Grill findings & resolutions

**F1 — Does a signed `Content-Length` PUT actually bind file size in this AWS SDK v3 setup?**
Verified in `upload.service.ts`: presigning uses `@aws-sdk/s3-request-presigner`
`getSignedUrl()` over a `PutObjectCommand`. Confirmed this is the standard, correct
technique: including `ContentLength` on the `PutObjectCommand` before presigning
causes S3 to require the client's PUT to send that **exact** `Content-Length` header,
or the request is rejected (SignatureDoesNotMatch / mismatched signed param). Resolution:
**MUST implement** — the new EMR presign service validates `fileSizeBytes ≤ 25MB` server-side,
then passes `ContentLength: fileSizeBytes` into the signed `PutObjectCommand`. No presigned-POST
/ `content-length-range` multipart change is needed; the existing PUT pattern is kept.

**F2 — Is private-bucket + gated presigned-GET a hard v1 prerequisite, or can EMR reuse the
pet-photo public-URL pattern?**
Verified in `config/storage.ts`: there is a single bucket, single credential set, no
per-prefix ACL/policy control in application code — bucket privacy is an infra/S3-bucket-policy
concern outside this repo's reach. Resolution (code-level, does not block on infra access):
- The EMR presign/confirm response **never returns a public URL** for EMR attachments (unlike
  the pet-photo flow's `publicUrl`).
- Download is **only** available via a new `GET /:id/attachments/:attId/download` route gated
  `emr.view`, which issues a short-TTL presigned GET with `Content-Disposition: attachment`.
- This is an app-level access control regardless of the underlying bucket's actual ACL. **Residual
  infra risk, tracked not blocked:** if the S3 bucket-wide policy is public-read (as the pet-photo
  flow's direct `https://bucket.s3.region.amazonaws.com/key` URL implies it may be), a UUID-keyed
  EMR object could still be fetched by anyone who guesses/leaks the key. Flagged to @db-agent/ops
  as a follow-up to verify/restrict the bucket policy for the `tenants/*/emr/*` prefix — does not
  block this feature's code from shipping, since the app never discloses the key or a working
  public URL through any authenticated-but-under-privileged path.

**F3 — Backward compatibility: does extending the confirm route break the existing URL-reference
capability or its callers?**
Verified in `medical-record.service.ts`: `addAttachmentSchema` currently requires `fileUrl` on
every call (`z.string().url()`), no optional-storageKey variant exists yet, and no other caller
of this schema was found in the repo. Resolution: the confirm route keeps accepting the legacy
`{fileName, fileUrl, fileType}` shape (URL-reference stays a valid, permitted way to attach
something already hosted externally — e.g. a referral portal link) **and** adds the new
`{fileName, storageKey, mimeType, fileSizeBytes, fileType}` shape, validated via a Zod
discriminated union / refine requiring **exactly one of** `fileUrl` XOR `storageKey`. This is
additive, not a breaking change — no existing test or caller regresses.

**F4 — Orphaned S3 objects (presign issued, PUT succeeds, confirm never called).**
Accepted as-is per brainstorm §3.4 (R7) — matches the existing pet-photo flow's same exposure
(no lifecycle rule exists there either). Not a regression introduced by this feature; out of
scope to fix pre-existing behavior in an unrelated flow.

**F5 — `fileType` category default when uploading via the new binary path vs the free-text
legacy path.**
Confirmed `fileType` is optional in the schema today. Resolution: keep it optional on both
shapes; the frontend upload UI may pre-select a sensible default from the MIME type (e.g.
`image/*` → `photo`) but does not force a category — user can override.

## Decision

Proceed with the BA design as specified, with F1–F5 resolved as above. No blocking findings
remain. `/write-plan` may proceed.

**Correction (2026-07-21, discovered during implementation):** the design doc's §2 actors table
and §7 authorization section originally stated assumption A1 — that `clinic_admin` is **denied**
`emr.attach`. This was stale/wrong: `prisma/seed-rbac.ts` (the live source of truth for RBAC)
grants `clinic_admin` the `emr.attach` permission. `clinic_admin` holds `emr.attach` (E), same as
`doctor` and `clinic_staff`. The design doc and `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md`
have been corrected to match. No code or permission-guard changes required — the guards already
reflect the live seed; only the documentation was wrong.

## Consequences

- New DB fields on `Attachment` (`mimeType`, `fileSize`, `storageKey`, `uploadedByUserId`) —
  additive, nullable/optional for legacy rows, no data migration of existing rows required.
- No new permission codes — `emr.attach` / `emr.view` reused throughout.
- Pet-photo upload flow (`usePhotoUpload.ts`, `/api/upload/presign`) is untouched.
- A residual infra risk (F2) is tracked, not blocking: verify the S3 bucket policy restricts
  public read on the `emr/` prefix.
