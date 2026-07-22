# Task Breakdown — Unified Local-Disk Storage Driver (EMR Attachments + Pet Photos)

**PM-Agent output — Step 2 of Anemal pipeline**
**Source design:** `docs/superpowers/specs/2026-07-22-emr-attachment-local-storage-design.md` (Status: Approved brainstorm, Option A — pending pm → ba → grill → write-plan)
**Feeds:** @ba-agent (Step 3 validation) → `/grill-with-docs` (Step 3.5, MANDATORY) → `/write-plan` (Step 4)
**Do not skip ahead:** this document is task/AC scaffolding only. No code, no write-plan authored here.

---

## 0. Scope confirmation (MVP framing)

This is a **replacement/repair** of already-shipped MVP functionality (ADR-0021 / PR #41 EMR attachments, and the pre-existing pet-photo upload), not a new-phase feature — it belongs in the **current** work queue, not the backlog. Rationale: EMR upload is currently broken in every environment without AWS credentials (503 STORAGE_NOT_CONFIGURED), which blocks a Must-have FR (FR-05 EMR/Clinical) and an FR-03 CRM item (pet photo, part of "Full CRUD"). Fixing the storage layer is corrective, in-phase work.

Scope = **Option A** per the approved design: both real upload paths (EMR attachments, pet photos) move to one `StorageDriver`. Clinic logo stays untouched (base64 inline, not a storage upload — confirmed out of scope, no task below touches it).

---

## 1. Task list

Grouped per the design's component boundaries. IDs use module prefix `STOR` (storage-driver core), `EMR` (EMR attachment routes/frontend), `PET` (pet-photo routes/frontend), `DEP` (dependency changes), `TEST`, `DOC`.

### Group A — Backend storage-driver core

**Task STOR-1 — Storage driver interface + LocalDiskDriver**
Actor/role: N/A (infra module, no direct actor) | Device: Both (backend-only, serves both Tablet + Web clients)
Description: Create `src/backend/config/storage-driver.ts` with the `StorageDriver` interface (`save`, `read`, `delete`, `exists`) and `getStorageDriver()` factory (returns `LocalDiskDriver` only, for now). Implement `LocalDiskDriver`: base dir from `ATTACHMENT_DIR` env (default `./attachments`), `mkdir -p` on save, and the **path-traversal guard** — resolve `path.join(baseDir, key)`, assert the resolved absolute path stays inside resolved `baseDir`, reject (throw a typed error) otherwise. Covers relative traversal (`..`) and absolute-path keys.
Acceptance Criteria:
- [ ] Given a valid key, `save()` writes the buffer to `{baseDir}/{key}`, creating parent directories as needed
- [ ] Given a key containing `../../etc/passwd`, `save()`/`read()`/`delete()`/`exists()` all reject before touching the filesystem, with a distinguishable error (not a generic 500)
- [ ] Given a key that is an absolute path (e.g. `/etc/passwd` or `C:\Windows\...`), same rejection as above
- [ ] `read()` returns the exact bytes previously `save()`d (round-trip)
- [ ] `delete()` on a missing file does not throw (idempotent — matches design §6 "best-effort unlink")
- [ ] `exists()` returns false for a never-written key, true after `save()`
- [ ] `ATTACHMENT_DIR` env var, when set, overrides the default `./attachments`
Permission(s): none (internal module, not a route)
Dependencies: none

**Task STOR-2 — .gitignore entry**
Actor/role: N/A | Device: N/A
Description: Add `attachments/` to the repo root `.gitignore`.
Acceptance Criteria:
- [ ] `git status` after a local upload does not show untracked files under `attachments/`
Permission(s): none
Dependencies: STOR-1

### Group B — Backend EMR attachment routes

**Task EMR-1 — Replace presign upload with direct multipart upload**
Actor/role: Doctor, Clinic Staff (whoever holds `emr.attach`) | Device: Both
Description: In `src/backend/routes/medical-record.routes.ts`, `src/backend/controllers/emr-attachment.controller.ts`, `src/backend/services/emr-attachment.service.ts`: replace `POST /:id/attachments/presign` + confirm flow with a single `POST /:id/attachments` using `multer` memory storage. Enforce the existing MIME allow-list + 25 MB cap (reuse constants in `src/backend/services/emr-attachment.constants.ts`). Verify the medical record belongs to the caller's tenant + branch before writing. Call `driver.save(key, buffer, mime)` (key format unchanged from PR #41: `tenants/{tenantId}/emr/{recordId}/{uuid}-{safeName}`), then create the `Attachment` row. Return the created row.
Acceptance Criteria:
- [ ] Given a doctor with `emr.attach` uploads a valid PDF ≤25MB to a record in their tenant/branch, when POST completes, then the file exists on disk at the derived key AND an `Attachment` row is created referencing it
- [ ] Given a disallowed MIME type (e.g. `.exe`), when POST is attempted, then response is 400 and no file/row is created
- [ ] Given a file >25MB, when POST is attempted, then response is 400/413 and no file/row is created
- [ ] Given a user without `emr.attach`, when POST is attempted, then response is 403
- [ ] Given a `recordId` that exists but belongs to a different tenant, when POST is attempted, then response is 404 (not 403 — existence-leak precedent per ADR-0014)
- [ ] Given the file write succeeds but the DB insert fails, then the orphan file is best-effort deleted (per design §6) — verify no orphan remains after a forced insert failure
- [ ] `emrPresignSchema` and `handlePresignAttachment` are deleted, and `POST /:id/attachments/presign` returns 404 (route removed, not just deprecated)
Permission(s): `emr.attach`
Dependencies: STOR-1

**Task EMR-2 — Authenticated streaming download**
Actor/role: Doctor, Clinic Staff (whoever holds `emr.view`) | Device: Both
Description: Add/modify `GET /:id/attachments/:attachmentId/download` in the same files. Verify tenant/record scope + the existing storageKey-prefix guard from PR #41. Call `driver.read(key)`, respond with `Content-Type`, `Content-Disposition: attachment; filename="..."`, body = buffer.
Acceptance Criteria:
- [ ] Given a valid attachment the caller has `emr.view` for, when GET is called, then response streams the correct bytes with correct `Content-Type` and `Content-Disposition` headers
- [ ] Given an attachment row exists but the file is missing on disk (data drift), when GET is called, then response is 404 with a clear message, and the event is logged
- [ ] Given a caller from a different tenant/branch, when GET is called with another tenant's attachment id, then response is 404
- [ ] Given a storageKey-prefix mismatch (record/attachment id combo doesn't match the key's embedded ids), when GET is called, then response is 404/400 (guard from PR #41 still enforced)
- [ ] Given a user without `emr.view`, when GET is called, then response is 403
Permission(s): `emr.view`
Dependencies: STOR-1

**Task EMR-3 — Delete attachment via driver**
Actor/role: Doctor, Clinic Staff (whoever holds `emr.attach`) | Device: Both
Description: Modify `DELETE /:id/attachments/:attachmentId` to call `driver.delete(key)` (best-effort, tolerate missing file) before/alongside deleting the `Attachment` row. Keep the existing billed-record block (from PR #41) unchanged.
Acceptance Criteria:
- [ ] Given a valid, non-billed attachment, when DELETE is called, then both the file and the row are removed
- [ ] Given the file is already missing on disk, when DELETE is called, then the row is still deleted (no 500), and the event is logged
- [ ] Given the parent record is billed, when DELETE is called, then response is the existing 4xx block (unchanged from PR #41) and nothing is deleted
- [ ] Given a user without `emr.attach`, when DELETE is called, then response is 403
Permission(s): `emr.attach`
Dependencies: STOR-1

### Group C — Backend pet-photo routes

**Task PET-1 — Pet photo upload via driver**
Actor/role: Clinic Staff/Admin (whoever holds `crm.edit`) | Device: Both
Description: Add `POST /api/pets/:id/photo` in `src/backend/routes/pet.routes.ts` + `src/backend/controllers/pet.controller.ts` + `src/backend/services/pet.service.ts`. Multer multipart. Image MIME allow-list (jpeg/png/webp) + size cap (5 MB per design — confirm value with @ba-agent/grill, see Open Questions §3). Verify pet belongs to tenant. `driver.save('tenants/{tenantId}/photo/{uuid}-{safeName}', ...)`, store the **storageKey** (not a URL) in `pet.photoUrl`. Return updated pet.
Acceptance Criteria:
- [ ] Given a staff member with `crm.edit` uploads a valid JPEG ≤5MB for a pet in their tenant, when POST completes, then the file exists on disk AND `pet.photoUrl` is updated to the storage key
- [ ] Given a disallowed image type or oversize file, when POST is attempted, then response is 400 and `pet.photoUrl` is unchanged
- [ ] Given a `petId` belonging to a different tenant, when POST is attempted, then response is 404
- [ ] Given a user without `crm.edit`, when POST is attempted, then response is 403
- [ ] Given a pet that already has a photo, when a new photo is uploaded, then the old file is cleaned up (best-effort) or explicitly left orphaned per a documented decision (flag as open question — see §3)
Permission(s): `crm.edit`
Dependencies: STOR-1

**Task PET-2 — Pet photo authenticated streaming**
Actor/role: any role holding `crm.view` | Device: Both
Description: Add `GET /api/pets/:id/photo`. Verify pet→tenant scope. `driver.read(pet.photoUrl)`, stream with correct `Content-Type`, inline disposition. 404 if pet has no photo or file is missing.
Acceptance Criteria:
- [ ] Given a pet with a photo, when GET is called by a caller with `crm.view` in-tenant, then response streams correct bytes + `Content-Type`, inline disposition
- [ ] Given a pet with no `photoUrl` set, when GET is called, then response is 404 with a clear "no photo" message (distinct from data-drift 404, at minimum distinguishable in logs)
- [ ] Given `photoUrl` is set but the file is missing on disk, when GET is called, then response is 404, logged as data drift
- [ ] Given a caller from a different tenant, when GET is called with another tenant's pet id, then response is 404
- [ ] Given a user without `crm.view`, when GET is called, then response is 403
Permission(s): `crm.view`
Dependencies: STOR-1

**Task PET-3 — Retire generic upload/presign endpoint**
Actor/role: N/A | Device: N/A
Description: Delete `src/backend/config/storage.ts` (S3 helpers), `src/backend/services/upload.service.ts`, `src/backend/controllers/upload.controller.ts`, `src/backend/routes/upload.routes.ts`, and remove `POST /api/upload/presign` route registration. Confirm (grep) nothing else imports these files before deletion.
Acceptance Criteria:
- [ ] `POST /api/upload/presign` returns 404 (route no longer registered)
- [ ] No remaining import references to the 4 deleted files anywhere in `src/backend` (verified by grep, zero hits)
- [ ] `src/backend/__tests__/upload.test.ts` is retired (see TEST-4)
Permission(s): none
Dependencies: EMR-1, PET-1 (both new paths must be live before the old one is removed)

### Group D — Frontend EMR

**Task EMR-F1 — Collapse EMR upload to single multipart call**
Actor/role: Doctor, Clinic Staff | Device: Both (EMR is used on tablet during consult and web at reception)
Description: Modify `src/frontend/src/hooks/useEmrAttachmentUpload.ts` to replace the 3-call presign→PUT→confirm flow with one `api.post('/api/medical-records/:id/attachments', formData)`, `Content-Type: multipart/form-data`, field name `file`. Keep the existing "must save record before attaching" guard in `src/frontend/src/views/clinic/ClinicEMR.tsx` (unsaved new record → `selectedRecordId` null blocks upload UI).
Acceptance Criteria:
- [ ] Given a saved EMR record open in ClinicEMR, when a user selects a valid file and clicks Upload, then exactly one network call is made (no presign/PUT/confirm sequence) and the attachment appears in the list on success
- [ ] Given an unsaved new record (`selectedRecordId` is null), the Upload control remains disabled/hidden as before
- [ ] Given a MIME/size rejection from the backend, the UI surfaces the server's error message (not a generic failure)
Permission(s): `emr.attach` (enforced server-side; UI hides control if absent)
Dependencies: EMR-1

**Task EMR-F2 — Authenticated blob download**
Actor/role: Doctor, Clinic Staff | Device: Both
Description: Modify the download handler in `ClinicEMR.tsx` (and `useEmrAttachmentUpload.ts` if download lives there) to replace `window.open(downloadUrl)` with `api.get(url, {responseType:'blob'})` → `URL.createObjectURL(blob)` → trigger download/open → `URL.revokeObjectURL`.
Acceptance Criteria:
- [ ] Given a user with `emr.view` clicks a listed attachment, then the file downloads/opens correctly (Bearer token carried via axios interceptor, not lost as a bare navigation would)
- [ ] Given the backend returns 404 (file missing / cross-tenant), the UI shows an error, not a silent failure or broken new tab
- [ ] Object URLs are revoked after use (no leak across repeated downloads — spot-checked in test or code review)
Permission(s): `emr.view`
Dependencies: EMR-2

### Group E — Frontend pet-photo + authed-image

**Task PET-F1 — Collapse pet-photo upload to single call**
Actor/role: Clinic Staff/Admin | Device: Both
Description: Modify `src/frontend/src/hooks/usePhotoUpload.ts` from presign→PUT (returning a public URL) to a single `api.post('/api/pets/:id/photo', formData)` returning the updated pet. Since this needs a pet id, adjust the **AddPet flow** in `src/frontend/src/views/clinic/ClinicPets.tsx` (AddPetModal is defined inline in this file, not a separate component) to create-the-pet-first-then-upload-photo, rather than upload-then-create.
Acceptance Criteria:
- [ ] Given a user creates a new pet with a photo selected, when they submit, then the pet is created first, then the photo is uploaded referencing the new pet id, and both succeed as a coherent UX (loading state covers both steps)
- [ ] Given the pet-create step succeeds but the photo-upload step fails, the UI clearly indicates the pet was created but photo failed (not a silent total failure) — exact recovery UX to be confirmed with @ba-agent/grill (see Open Questions §3)
- [ ] Given a user edits an existing pet's photo (EditPetModal, also inline in `ClinicPets.tsx`), the new single-call upload replaces the old photo reference on the pet
Permission(s): `crm.edit`
Dependencies: PET-1

**Task PET-F2 — AuthedPetImage / useAuthedImage component**
Actor/role: any role holding `crm.view` | Device: Both
Description: Build a `useAuthedImage(petId)` hook and/or `<AuthedPetImage>` component (new file, e.g. `src/frontend/src/components/AuthedPetImage.tsx`): `api.get('/api/pets/:id/photo', {responseType:'blob'})` → object URL → `<img src={objectURL}>`, revoke on unmount.
Acceptance Criteria:
- [ ] Given a pet with a photo, rendering `<AuthedPetImage petId={id}>` displays the image (Bearer auth carried via api client, unlike bare `<img src>`)
- [ ] Given a pet with no photo, the component shows a placeholder/fallback (no broken-image icon)
- [ ] Object URL is revoked when the component unmounts (no leak on list re-renders)
Permission(s): `crm.view`
Dependencies: PET-2

**Task PET-F3 — Audit and replace ALL photo-display sites**
Actor/role: any role viewing pet photos across modules | Device: Both
Description: This is a required, explicitly-enumerated task per the design (§4.4) — do not fold into PET-F2. Find and replace every direct `<img src={photoUrl}>` (or equivalent) that will now receive a private storageKey instead of a URL, in:
  - `src/frontend/src/views/clinic/ClinicPets.tsx` (grid + detail + modals)
  - `src/frontend/src/views/clinic/ClinicInpatient.tsx`
  - `src/frontend/src/views/clinic/ClinicBilling.tsx`
  - `src/frontend/src/views/clinic/ClinicAppointments.tsx`
  Grep for `photoUrl` in `src/frontend/src` at task-start time to confirm this list is complete (the design's enumeration is a snapshot, not guaranteed exhaustive) and update it if more sites exist.
Acceptance Criteria:
- [ ] `grep -rn "photoUrl" src/frontend/src` after this task shows zero remaining bare `<img src={pet.photoUrl}>` (or string-interpolated) usages — all replaced by `AuthedPetImage`/`useAuthedImage`
- [ ] Given a pet has a photo, it renders correctly on ClinicPets grid, ClinicInpatient board, ClinicBilling cart/receipt (if photo shown there), and ClinicAppointments calendar/list card
- [ ] Given a pet has no photo, all four screens show a consistent placeholder, not a broken image
Permission(s): `crm.view`
Dependencies: PET-F2

### Group F — Dependencies

**Task DEP-1 — Add multer, remove @aws-sdk/***
Actor/role: N/A | Device: N/A
Description: Add `multer` + `@types/multer` (dev dep) to `src/backend/package.json`. Verify (grep) `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` have no remaining importers after Group B/C/PET-3 land, then remove both from `package.json` and run install to update the lockfile.
Acceptance Criteria:
- [ ] `npm ls multer` succeeds in `src/backend` after install
- [ ] Given all EMR/pet-photo/upload-service changes are merged, `grep -rn "@aws-sdk" src/backend --include=*.ts` (excluding `node_modules`, `dist`) returns zero hits before the deps are removed from `package.json`
- [ ] Lockfile updated, `npm install` reproducible from a clean checkout
Permission(s): none
Dependencies: EMR-3, PET-3

### Group G — Tests

**Task TEST-1 — Local driver unit tests**
Description: New test file for `storage-driver.ts` — save→read round-trip, delete idempotency, exists() true/false, path-traversal rejection (`../` relative and absolute-path keys).
Acceptance Criteria: matches STOR-1's AC list, expressed as automated tests.
Permission(s): n/a | Dependencies: STOR-1

**Task TEST-2 — EMR attachment integration tests**
Description: Rewrite `src/backend/__tests__/emr-attachments.test.ts` — drop presign/503 cases, add multipart upload happy path, MIME rejection, oversize rejection, streaming download (bytes + headers), cross-tenant/cross-record 404, path-traversal key rejection, delete removes file+row, delete tolerates missing file, plus `emr.attach`/`emr.view` RBAC assertions per qa-protocols.
Acceptance Criteria: matches EMR-1/EMR-2/EMR-3 AC lists, expressed as automated tests.
Permission(s): n/a | Dependencies: EMR-1, EMR-2, EMR-3

**Task TEST-3 — Pet-photo integration tests (new/updated)**
Description: Multipart upload stores key + writes file, image MIME/size rejection, `GET /pets/:id/photo` streams bytes with correct headers + `crm.view` gate, cross-tenant pet 404, no-photo 404, `crm.edit`/`crm.view` RBAC assertions.
Acceptance Criteria: matches PET-1/PET-2 AC lists, expressed as automated tests.
Permission(s): n/a | Dependencies: PET-1, PET-2

**Task TEST-4 — Frontend hook + component tests**
Description: Update `src/frontend/src/__tests__/useEmrAttachmentUpload.test.ts` and `ClinicEMR.attachments.test.tsx` for single-call multipart flow + blob download. Update/add `usePhotoUpload` test, `AddPetModal.test.tsx`, `EditPetModal.test.tsx` for create-then-upload ordering. Add a new test for `AuthedPetImage`/`useAuthedImage`. Retire `src/backend/__tests__/upload.test.ts` (presign/503 cases for the removed endpoint).
Acceptance Criteria: matches EMR-F1/EMR-F2/PET-F1/PET-F2/PET-F3 AC lists, expressed as automated tests; old `upload.test.ts` deleted, not just skipped.
Permission(s): n/a | Dependencies: EMR-F1, EMR-F2, PET-F1, PET-F2, PET-F3, PET-3

### Group H — Docs

**Task DOC-1 — ADR + tracking doc updates**
Description: Author the ADR (per grill/domain-modeling step — this task executes after Step 3.5, owned by @pm-agent last per CLAUDE.md). Update CLAUDE.md phase table, `implementation-status-matrix.md`, and `docs/index.html` / `functional_spec_detailed.html` per the standard "@pm-agent documents LAST" rule. Record the pre-production BYO-cloud-driver reminder (design §9) explicitly in the ADR's consequences section, referencing the existing cross-session memory note `emr-storage-local-then-cloud`.
Acceptance Criteria:
- [ ] ADR file exists at `docs/adr/00XX-...md`, cross-referenced from CLAUDE.md's phase table row for this feature
- [ ] CLAUDE.md, implementation-status-matrix.md, docs HTML all updated in the same PR, last-committed step
Permission(s): n/a | Dependencies: all above groups shipped + QA sign-off

---

## 2. Ponytail 7-criteria scope assessment (preliminary — @ponytail-agent runs the real gate at Step 5)

| # | Criterion | Assessment |
|---|---|---|
| 1 | Over-engineering? | No — driver interface is 4 methods, one concrete implementation. Streaming/signed-URL branch explicitly deferred (design §5, YAGNI). |
| 2 | Duplicate work? | No — replaces broken S3 code, does not coexist with it. |
| 3 | Existing solution covers it? | Partially — `multer` is the standard Express multipart lib (justified 1 new dep, no stdlib equivalent for multipart parsing). |
| 4 | **Scope too large?** | **Risk — flag for Ponytail.** Files touched span backend (routes/controllers/services × 2 domains + new driver file + deletions) and frontend (2 hooks + 4 view files for the photo-audit + 1 new component) — plausibly 15–20 files touched when counting deletions and test files, which **crosses the >15-files / >3-subsystems thresholds**. **Approved fallback (per this task's brief): if @ponytail-agent rejects on scope, split PET-* (pet-photo groups C/E) into a fast-follow PR, ship EMR-only (Groups A/B/D/F(partial)/G(partial)) first.** This task list is written so that split is mechanical — Groups C and E are self-contained. |
| 5 | Too many dependencies? | No net increase — `multer`+`@types/multer` in, 2× `@aws-sdk/*` out. Net **-1** dependency. |
| 6 | Too many files? | Same risk as #4 — call it out explicitly to @ponytail-agent; the split fallback resolves it. |
| 7 | Too many APIs? | EMR: net 0 (presign removed, direct-upload added, download unchanged route path). Pet: **+2 new routes** (`POST`/`GET /api/pets/:id/photo`), 1 removed (`POST /api/upload/presign`). Net **+1** endpoint. Within the ≤3 threshold on its own, but combined with the files/subsystems risk above, still flag group C/E as the splittable unit. |

**Recommendation to @ba-agent and the grill:** treat this as one design but two shippable increments. Grill should stress-test whether EMR-only-first materially changes any acceptance criteria (it should not — Groups C/D/E/F/G's pet-photo portions are additive, not entangled with EMR's fix).

---

## 3. Open questions / risks for @ba-agent and `/grill-with-docs`

1. **Pet-create ordering (design §4.3b, PET-F1).** Create-pet-then-upload-photo changes the AddPet UX contract — what happens if pet-create succeeds but photo-upload fails? Does the pet stay created (photo-less, user retries later) or does the whole operation get presented as failed? Needs an explicit UX decision, not left to developer judgment.
2. **`pet.photoUrl` field-meaning change.** The column now holds a private storage key, not a URL — despite an unchanged DB type (string). Confirm this is acceptable long-term (no rename now) or whether a rename (e.g. `photoKey`) is preferred for clarity/anti-confusion, accepting the migration cost. Design asserts "no DB migration needed... no real photoUrl values exist" — verify this against production data before this is finalized (any pilot/staging tenant with real S3 photoUrl values would be silently broken).
3. **Old-photo cleanup on re-upload (PET-1 AC #5).** When a pet's photo is replaced, is the old file deleted from disk, or left orphaned? Local disk has no lifecycle/GC — orphans accumulate forever if not deleted. Needs an explicit decision (not currently specified in the design doc).
4. **Image size cap value.** Design says "e.g. 5 MB" for pet photos — needs to be a firm number before write-plan (task PET-1 currently carries the design's placeholder).
5. **`@aws-sdk/*` removal safety.** Design says "verify before removing" (§4.5) — confirm via grep that no other module (e.g. a future feature already merged, or a script) references these packages before DEP-1 executes. Low risk but must be checked, not assumed.
6. **Multi-branch/tenant volume growth on local disk.** No cap on total `ATTACHMENT_DIR` size is specified. Out of scope for this pass (local disk is testing-only per design §9), but worth a one-line risk note in the ADR so it isn't forgotten.
7. **Concurrent upload race on pet-photo replace.** Two simultaneous photo uploads for the same pet (e.g. two staff tablets) — last-write-wins on `pet.photoUrl`, but does the earlier file get orphaned/leaked? Same root issue as #3, flagging separately because it's a race, not just a lifecycle question.
8. **`ClinicBilling.tsx` / `ClinicAppointments.tsx` — is a photo even shown at billing/appointments, and is it worth the two extra file touches vs. leaving those as pre-existing (if broken) and fixing in fast-follow?** Verify at grill time whether these two are actually rendering pet photos today or if the grep hit is a false positive (e.g. a different `photoUrl`-named field), to avoid touching files unnecessarily (ties to ponytail criterion #4/#6).

---

## 4. Real-workflow validation note (PM sign-off)

Walked this against the target workflow — doctor mid-consult uploads a lab PDF (EMR-1/EMR-2, tablet), and front-desk staff photographs a new patient at intake (PET-1/PET-F1, tablet camera roll or upload). Both paths stay single-tap/single-form-submit after this change (collapsing 3 network calls to 1 is a UX improvement, not just an internal refactor) — consistent with the touch-first NFR. No feature beyond the approved design was added to this task list; the two "audit" tasks (EMR download, PET-F3 photo-site sweep) are drawn directly from the design's own explicit requirements (§4.4, §4.5), not scope-creep.
