# EMR File Attachments — BA Design & Sign-off (Step 3)

- **Author:** @ba-agent · **Date:** 2026-07-21 · **Spec area:** `EMR-ATTACH`
- **Feeds:** CLAUDE.md Step 3.5 `/grill-with-docs` (mandatory) → Step 4 `/write-plan`
- **Brainstorm input:** `docs/superpowers/specs/2026-07-21-emr-file-attachments-brainstorm.md`
- **Skills applied:** `anemal-ba-toolkit`, `anemal-rbac-matrix`, `anemal-db-context` (advisory — DB fields recommended, schema NOT edited per task).

> **Scope of this doc:** design & requirements only. No production code, no schema edits. New DB fields are *recommended* to @db-agent; the migration is theirs to write.

---

## 1. Objective (one sentence)

Turn the EMR "Attachments" panel from a URL-reference stub into a real, permissioned, tenant-isolated file-upload feature (PDF / images / office docs) that stores binaries in the clinic's own S3 and links them to the medical record with full metadata.

---

## 2. Actors & roles (from `anemal-rbac-matrix`)

| Role | Holds `emr.attach`? | Capability here |
|---|---|---|
| `doctor` | **Yes (E)** | Upload, view, download, delete (own, pre-billing) |
| `clinic_staff` | **Yes** (matrix note §2: staff can `emr.view` + `emr.attach`) | Upload, view, download, delete (pre-billing) |
| `clinic_admin` | **Yes (E)** | Upload, view, download, delete (corrected per live `seed-rbac.ts`; A1 previously stated denied — was stale) |
| Any clinical role | `emr.view` | View list + download |

Plane: **clinic only**. No platform-plane involvement (platform never touches clinical data / PII).

---

## 3. Business rules (invariants)

- **BR-1** Every attachment belongs to exactly one medical record, which belongs to exactly one tenant. `tenantId` is derived from the JWT context, never from the client.
- **BR-2** An attachment can only be created against a medical record the caller's tenant (and branch, per the existing `getMedicalRecord` scope) can see. Cross-tenant/branch = 404 (existence-leak precedent, ADR-0014).
- **BR-3** The stored S3 key MUST live under `tenants/{tenantId}/emr/{recordId}/…`. The confirm step MUST reject any `storageKey` whose prefix does not match the caller's `tenantId` + target `recordId` (prevents registering a foreign/arbitrary object as an attachment — IDOR).
- **BR-4** Only allow-listed MIME types (§5) are accepted, validated at **both** presign and confirm.
- **BR-5** File size ≤ 25 MB, enforced server-side via a signed `Content-Length` (client cannot exceed the signed value).
- **BR-6** Deletion is blocked once the parent record has a `paid` invoice (mirrors `medical-record.service.ts` `updateMedicalRecord` billed-record guard) and is audit-logged.
- **BR-7** Download of a clinical attachment requires `emr.view` (target design: private bucket + presigned GET; see R5).

---

## 4. AS-IS → TO-BE

### 4.1 AS-IS (verified in repo)

- **Route:** `POST /api/medical-records/:id/attachments` — `requirePlane('clinic')` + `requirePermission('emr.attach')` + `validate(addAttachmentSchema)`.
- **Payload:** `{ fileName, fileUrl (must be a valid URL), fileType? ∈ {lab,xray,photo,other} }` — a **link only**; no binary ever reaches our storage.
- **Service:** `addAttachment()` verifies the record exists (tenant+branch scoped) → `createAttachment(tenantId, medicalRecordId, data)`.
- **Model `Attachment`:** `id, tenantId, medicalRecordId, fileName, fileUrl, fileType?, createdAt` — index `[tenantId, medicalRecordId]`. **No** `uploadedBy`, `fileSize`, `mimeType`, `storageKey`.
- **Presign:** `POST /api/upload/presign` gated by **`crm.edit`**; `contentType ∈ {image/jpeg,image/png,image/webp}`; key `tenants/{tenantId}/pets/{uuid}-{safe}`; 300 s TTL; returns `{uploadUrl, publicUrl, key}`; **public-bucket** `publicUrl`; **no size cap**. Consumed only by `usePhotoUpload.ts` (pet photos).
- **Frontend:** `ClinicEMR.tsx` ~L599–611 — attachments panel is **display-only**; renders `fileName` link + `fileType` badge. **No upload control exists at all.**

### 4.2 TO-BE (standard presign → PUT → confirm)

```
1. User picks a file in the EMR Attachments panel (new upload UI).
2. Client pre-validates type + size (UX only; not the boundary).
3. POST /api/medical-records/:id/attachments/presign
      body { fileName, contentType, fileSizeBytes, fileType? }
      guard requirePlane('clinic') + requirePermission('emr.attach')
      server: record ∈ tenant?  contentType ∈ allow-list?  size ≤ 25MB?
      -> signs PutObject with Key=tenants/{tenantId}/emr/{recordId}/{uuid}-{safe}
         and bound ContentLength; returns { uploadUrl, storageKey }
4. Client PUT file -> S3 (uploadUrl; Content-Length must equal signed value).
5. POST /api/medical-records/:id/attachments   (confirm — existing route, extended)
      body { fileName, storageKey, mimeType, fileSizeBytes, fileType? }
      server: record ∈ tenant?  storageKey prefix == tenants/{tenantId}/emr/{recordId}/ ?
              mimeType ∈ allow-list?
      -> create Attachment { …, uploadedByUserId, fileSize, mimeType, storageKey }
6. Panel refetches; row shows name · category badge · size · uploader · date · download.
7. Download: GET .../attachments/:attId/download  guard emr.view
      -> presigned GET (private bucket) OR public URL (interim) — see R5.
```

---

## 5. Accepted MIME allow-list (single source of truth)

| MIME | Ext | Category default |
|---|---|---|
| `image/jpeg` | jpg/jpeg | photo/xray |
| `image/png` | png | photo/xray |
| `image/webp` | webp | photo |
| `image/gif` | gif | photo |
| `application/pdf` | pdf | lab/other |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | docx | other |
| `application/msword` | doc | other |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | xlsx | lab/other |
| `application/vnd.ms-excel` | xls | lab/other |

Rejected everywhere: `image/svg+xml`, `text/html`, any `application/x-*` executable, `application/zip`, `application/dicom`, `video/*`, `image/heic`, `image/tiff`.

> `fileType` (lab/xray/photo/other) stays a **user-chosen semantic category** and is distinct from `mimeType` (the technical type). Do **not** repurpose or rename `fileType` — `ClinicEMR.tsx` renders it as a badge.

---

## 6. Requirements (MoSCoW)

> Format: ID · requirement · owner-agent · acceptance criteria.

### MUST

| ID | Requirement | Owner | Acceptance |
|---|---|---|---|
| EMR-ATTACH-1 | Dedicated EMR presign route `POST /api/medical-records/:id/attachments/presign`, gated `requirePlane('clinic')`+`requirePermission('emr.attach')` | dev | Doctor & staff get a signed URL; a role without `emr.attach` gets 403; unauth gets 401 |
| EMR-ATTACH-2 | Presign validates target record ∈ caller tenant/branch before signing | dev/db | Presign against a foreign-tenant `:id` returns 404 (not 403) |
| EMR-ATTACH-3 | Presign accepts only §5 MIME allow-list | dev | `image/svg+xml`, `application/zip`, `.exe` → 422; PDF/DOCX/JPEG → 200 |
| EMR-ATTACH-4 | Presign enforces size ≤ 25 MB via signed `Content-Length`; a PUT exceeding it fails at S3 | dev | Declaring 26 MB → 422; PUT of more bytes than signed → S3 rejects |
| EMR-ATTACH-5 | S3 key namespaced `tenants/{tenantId}/emr/{recordId}/{uuid}-{safe}`; `tenantId` from context only | dev | Key never contains a client-supplied tenant; two tenants never share a prefix |
| EMR-ATTACH-6 | Confirm route (existing `POST /:id/attachments`) extended to accept `{storageKey, mimeType, fileSizeBytes}` and persist them | dev | Row stores storageKey, mimeType, fileSize, uploadedByUserId |
| EMR-ATTACH-7 | Confirm rejects a `storageKey` whose prefix ≠ `tenants/{tenantId}/emr/{recordId}/` | dev | Pasting another record's/tenant's key → 400/404; no row created |
| EMR-ATTACH-8 | Confirm re-validates `mimeType` ∈ allow-list (defense-in-depth) | dev | Forged confirm with `text/html` → 422 |
| EMR-ATTACH-9 | New DB fields on `Attachment`: `mimeType`, `fileSize` (Int, bytes), `storageKey`, `uploadedByUserId` (FK→User, nullable for legacy rows); index on `uploadedByUserId` if queried | **db** | Migration adds columns non-breaking; existing rows keep `fileUrl`; `createdAt` already covers upload date |
| EMR-ATTACH-10 | Frontend upload UI in `ClinicEMR.tsx` attachments panel (pick → presign → PUT → confirm → refetch); shows progress, errors, and the new metadata | dev/uiux | Doctor uploads a PDF and sees it appear with size/uploader/date; oversized/blocked type shows a clear message |
| EMR-ATTACH-11 | Backend is the boundary: every check (perm, tenant, type, size, prefix) enforced server-side regardless of UI | dev/qa | QA can create/reject via API with no UI |

### SHOULD

| ID | Requirement | Owner | Acceptance |
|---|---|---|---|
| EMR-ATTACH-12 | Download endpoint `GET /api/medical-records/:id/attachments/:attId/download` gated `emr.view`, returning a short-lived presigned GET (private bucket) with `Content-Disposition: attachment` | dev | A user without `emr.view` gets 403; link expires; browser downloads (not inline-executes) the file |
| EMR-ATTACH-13 | Delete endpoint `DELETE /api/medical-records/:id/attachments/:attId` gated `emr.attach`; blocked when parent record has a `paid` invoice; audit-logged; also removes/marks the S3 object | dev | Staff deletes own mistaken upload; delete on a billed record → 403; audit row written |
| EMR-ATTACH-13b | Private bucket for EMR attachments (A2/R5) instead of the pet-photo public-URL pattern | db/dev | EMR objects are not world-readable; access only via EMR-ATTACH-12 |

### COULD

| ID | Requirement |
|---|---|
| EMR-ATTACH-14 | Drag-and-drop / multi-file select |
| EMR-ATTACH-15 | Inline image/PDF preview thumbnail |
| EMR-ATTACH-16 | HEIC/TIFF support once a preview/convert path exists |

### WON'T (this iteration) — see brainstorm §3.4

Virus scanning · versioning · per-record file-count cap · per-tenant storage quota · OCR/index · annotation · pet-photo-flow refactor.

---

## 7. Authorization design (permission decisions)

```
Presign (create intent):  emr.attach   [reuse — already gates the create route]
  Default roles: doctor (E), clinic_staff (E), clinic_admin (E — corrected per live seed-rbac.ts, A1). Configurable: yes (custom roles).
  Rationale: presign is the first half of "attach"; gating it with the same code the
             confirm route already uses keeps one capability = one code, and fixes the
             crm.edit lockout that reusing /api/upload/presign would cause.
  Risk if wrong: gating presign by crm.edit locks doctors out (they lack it) — the exact bug we avoid.

Confirm (create record):  emr.attach   [UNCHANGED — already the guard on POST /:id/attachments]

Download:                 emr.view
  Default roles: all clinical roles. Configurable: yes.
  Rationale: reading an attachment = reading EMR data; the module's read code already governs that.
  Risk if wrong: public/world-readable clinical PII (R5) or a doctor unable to open a result.

Delete:                   emr.attach   [+ billed-record guard + audit]
  Default roles: doctor, clinic_staff. Configurable: yes.
  Rationale: "manage the attachments I can add" — no separate delete code needed (deny-by-default
             already satisfied; avoids a new catalogue entry). Medico-legal weight handled by the
             billed-record lock + audit, not by a stricter role.
  Risk if wrong: silent loss of clinical evidence — mitigated by BR-6.
```

**No new permission codes are introduced.** All four operations map onto the existing `emr.attach` / `emr.view` catalogue — deny-by-default is preserved and the RBAC matrix needs no new row. (Route→permission additions for the new presign/download/delete routes must be appended to `permission-matrix.md` §3 by @dev-agent when implemented.)

---

## 8. Gap analysis — URL-reference → real upload

| # | Gap (missing today) | Impact | Recommendation | Owner |
|---|---|---|---|---|
| G-1 | No EMR presign route; the generic one is gated `crm.edit` (doctors lack it) | Primary user cannot upload | New `emr.attach`-gated presign route (EMR-ATTACH-1) | dev |
| G-2 | Presign `contentType` enum has no PDF/DOCX | Cannot attach the main document types | Extend to §5 allow-list on the new route | dev |
| G-3 | No file-size cap on presign | Storage abuse / oversized uploads | Signed `Content-Length` ≤ 25 MB (EMR-ATTACH-4) | dev |
| G-4 | Key prefix is `…/pets/…`, no record association | No EMR traceability; can't prefix-validate on confirm | Key `tenants/{tenantId}/emr/{recordId}/…` (EMR-ATTACH-5) | dev |
| G-5 | Confirm accepts only `{fileName,fileUrl,fileType}` — no storageKey/mime/size | Metadata incomplete; can't prefix-validate | Extend confirm payload + persist (EMR-ATTACH-6/7) | dev |
| G-6 | `Attachment` model lacks `uploadedBy`, `fileSize`, `mimeType`, `storageKey` | Required metadata unstorable; no accountability | Add 4 fields (EMR-ATTACH-9) — **@db-agent owns migration** | db |
| G-7 | No confirm-time storageKey prefix validation | IDOR: register a foreign object as your attachment | Prefix check (BR-3 / EMR-ATTACH-7) | dev |
| G-8 | No upload UI in `ClinicEMR.tsx` (display-only) | Feature unusable end-to-end | Add upload panel + EMR upload hook (EMR-ATTACH-10) | dev/uiux |
| G-9 | Download relies on public-bucket URL | Clinical PII world-readable on URL leak | Private bucket + gated presigned GET (EMR-ATTACH-12/13b) | db/dev |
| G-10 | No delete path | Wrong files are permanent | Gated + billed-guarded delete (EMR-ATTACH-13) | dev |
| G-11 | No audit trail on attach/delete of clinical evidence | Medico-legal traceability gap | Audit-log create+delete | dev |
| G-12 | Orphaned S3 objects when confirm never fires | Minor storage waste | S3 lifecycle rule to expire un-confirmed prefixes, OR accept | db/ops |

---

## 9. Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Residual |
|---|---|---|---|---|---|
| R1 | Upload abuse / storage exhaustion | M | M | 25 MB cap; per-tenant storage quota (future, Platform Console) | Accept until quota ships |
| R2 | Oversized file bypass | L | M | Signed `Content-Length`; server rejects >cap at presign; S3 rejects mismatched PUT | Low |
| R3 | Malicious/wrong MIME (exe-as-pdf, SVG/HTML XSS) | M | H | Allow-list at presign **and** confirm; exclude active-content types; `Content-Disposition: attachment`; never render untrusted HTML/SVG inline | Low (no scanning — R6) |
| R4 | Cross-tenant key/prefix (IDOR) | M | H | Key built from context `tenantId`; confirm rejects mismatched prefix (BR-3); presign verifies record ∈ tenant | Low |
| R5 | Clinical PII world-readable (public bucket) | M | H | Target design: private bucket + `emr.view`-gated presigned GET download | Interim public-URL parity is an **accepted risk only if the bucket is already access-restricted**; otherwise MUST do R5 before ship |
| R6 | No virus/malware scanning | M | M | Allow-list + no server execution + attachment disposition; async scan is v2 | Accepted, recorded (brainstorm §3.4) |
| R7 | Orphaned S3 objects (presign, no confirm) | H | L | S3 lifecycle expiry on `…/emr/…` un-referenced, or accept cost | Accept |
| R8 | Doctor locked out (crm.edit reuse) | — | H | **Designed out** via dedicated `emr.attach` presign route | Resolved |
| R9 | Silent deletion of clinical evidence | L | H | Billed-record delete guard (BR-6) + audit log | Low |

---

## 10. NFR impact

- **Performance:** upload bytes go direct client→S3 (presign pattern) — the API never proxies file bodies; API load stays low. Presign + confirm are small JSON calls.
- **Scalability:** stateless; scales with S3. Per-tenant key prefixing keeps listings bounded.
- **Availability:** graceful `503 STORAGE_NOT_CONFIGURED` already exists (`isStorageConfigured`) — reuse; the panel must degrade to "storage unavailable" not crash.
- **Security:** covered by R3–R6, BR-1..BR-7; server-side boundary (EMR-ATTACH-11).
- **Maintainability:** one MIME allow-list constant shared by presign + confirm; no new permission codes; pet-photo flow untouched.

---

## 11. Definition of Ready check

| DoR item | Status |
|---|---|
| Objective stated | ✅ §1 |
| Actors & roles named | ✅ §2 |
| Permission codes assigned | ✅ §7 (`emr.attach` / `emr.view`, no new codes) |
| Business rules listed | ✅ §3 |
| Exceptions/edge cases | ✅ §3, §9 (foreign tenant, oversized, bad MIME, billed record, storage-down, orphan) |
| NFR impact noted | ✅ §10 |
| Acceptance criteria testable by @qa | ✅ §6 |
| Risks & dependencies recorded | ✅ §9; dependency on @db-agent migration (G-6) + bucket privacy decision (R5) |

**Cross-agent dependencies:** @db-agent (EMR-ATTACH-9 migration + R5 bucket privacy), @uiux-agent (EMR-ATTACH-10 panel), @dev-agent (routes/service/hook). @pm-agent breaks this into tasks after grilling.

---

## 12. BA sign-off

**APPROVED for grilling.**

Design is internally consistent, introduces no new permission codes, preserves deny-by-default and tenant isolation, and closes the URL-reference→real-upload gap with the standard presign→PUT→confirm pattern. Two items the grill (Step 3.5) MUST pressure-test before `/write-plan`:

1. **R5 bucket privacy** — is the interim public-URL parity acceptable, or is private-bucket + gated GET (EMR-ATTACH-12/13b) a hard prerequisite for v1? (BA leans: hard prerequisite — this is clinical PII.)
2. **Size-cap enforcement mechanism** — confirm the signed `Content-Length` PUT approach truly binds max size in this AWS setup, or whether a presigned **POST** with `content-length-range` is required (changes the frontend PUT→multipart-POST).

No blocking concerns from a requirements/authorization standpoint.
