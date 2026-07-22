# EMR File Attachments — Brainstorm (Step 1)

- **Feature:** Let clinic staff upload real FILE attachments (PDF / images / DOCX and similar) to a pet's EMR, replacing the current URL-reference-only path.
- **Author:** @ba-agent · **Date:** 2026-07-21 · **Status:** Brainstorm → feeds BA design (companion doc)
- **Pipeline position:** CLAUDE.md Step 1 (brainstorm) + Step 3 (BA validate/design) run together — no human present for interactive brainstorming. All product decisions below are made by @ba-agent and flagged as assumptions.
- **Companion:** `docs/superpowers/specs/2026-07-21-emr-file-attachments-design.md` (BA sign-off, requirements, authz, gap analysis, risk register).

---

## 1. Objective

A doctor/vet-tech records a consultation and needs the actual document — the external lab PDF, the X-ray JPEG, a referral letter (DOCX) — attached to the medical record itself, not a link to a file that lives somewhere else. Today the EMR can only store a **URL reference** to a file the clinic hosts elsewhere, and there is **no UI to create even that**. The objective is a first-class, in-product upload: pick a file → it lands in the clinic's own S3 storage → it is durably linked to the EMR case with full metadata.

**Business value:** the medical record becomes self-contained and portable (medico-legal completeness, faster consults, no dead external links).

---

## 2. User stories

| # | As a… | I want to… | so that… |
|---|---|---|---|
| US-1 | Doctor | attach a lab-result PDF / X-ray image to the SOAP record I'm writing | the diagnostic evidence lives with the case |
| US-2 | Vet tech (clinic_staff) | upload an external lab or imaging file into a record | the doctor sees results without a separate system |
| US-3 | Doctor / staff | see each attachment's file name, type/category, size, who uploaded it and when | I can trust and audit the record |
| US-4 | Doctor / staff | open/download an attachment from the record | I can read the document during the consult |
| US-5 | Doctor / staff | remove an attachment I uploaded by mistake (before the visit is billed) | wrong files don't pollute the clinical record |
| US-6 | Any clinical role | be blocked from uploading unsupported/oversized/dangerous file types | the store stays safe and predictable |

---

## 3. Scope decisions

### 3.1 Accepted file types (v1)

| Group | Types | Decision |
|---|---|---|
| Images | JPEG, PNG, WEBP, GIF | **IN** — browser-renderable, primary imaging use (X-ray/photo exports) |
| Documents | PDF | **IN (primary)** — lab results, referrals, consents |
| Office docs | DOCX, DOC, XLSX, XLS | **IN** — referral letters, lab spreadsheets (DOC/XLS legacy but common in TH clinics) |
| Explicitly OUT | SVG, HTML, `.exe`/scripts, `.zip`/archives, DICOM (`.dcm`), video, HEIC/TIFF | **OUT** — see justification below |

**OUT justifications:**
- **SVG / HTML** — active-content XSS vector (can embed `<script>`); no clinical need. Excluded on security grounds, not convenience.
- **Executables / archives** — malware delivery vector, zero clinical justification.
- **DICOM (`.dcm`)** — huge (often 100s of MB), needs a specialized viewer; out of the 25 MB cap and out of a document-attachment feature's remit. Clinics export DICOM to JPEG/PDF for records — those are IN.
- **HEIC / TIFF** — no reliable in-browser preview; would upload as an un-viewable blob. Deferred to a "Could" until preview is solved.
- **Video** — size + no clinical workflow in v1.

### 3.2 Max file size

- **Decision: 25 MB per file.** Covers multi-page lab PDFs (<5 MB), photos (<10 MB), and JPEG/PDF-exported X-rays (10–20 MB) without inviting storage abuse. Enforced server-side (see design doc — signed `Content-Length`).

### 3.3 Storage approach — reuse presign vs new endpoint

**Decision: reuse the presign *pattern* (presign → direct-to-S3 PUT → confirm-in-DB) but add a dedicated EMR presign route, not the existing generic one.** The existing `POST /api/upload/presign` cannot be reused as-is:

1. It is gated by **`crm.edit`**, which **doctors do not hold** — yet doctors are the primary `emr.attach` holders. Reusing it would lock the main user out. (Verified against `permission-matrix.md` §2.)
2. Its `contentType` enum allows **only** `image/jpeg | image/png | image/webp` — no PDF/DOCX.
3. Its key prefix is `tenants/{tenantId}/pets/…` — pet-photo namespace, not EMR-scoped, and carries no medical-record association for traceability.
4. It enforces **no size cap**.

A new `POST /api/medical-records/:id/attachments/presign` gated by `emr.attach`, keyed under `tenants/{tenantId}/emr/{recordId}/…`, with the EMR content-type allow-list and size cap, is cleaner, correctly permissioned, and lets the presign step verify the target record belongs to the caller's tenant before signing. The existing pet-photo flow (`usePhotoUpload.ts`) is left untouched.

### 3.4 Explicitly OUT of scope (with justification)

| Out of scope | Why |
|---|---|
| **Virus / malware scanning** | Needs ClamAV or a 3rd-party async pipeline — a subsystem of its own. Mitigated in v1 by a strict type allow-list, excluding active-content types (SVG/HTML/exe), forcing `Content-Disposition: attachment` on download, and never server-side-executing uploads. Residual risk accepted and recorded (design R6); async scan is a v2 item. |
| **File versioning / replace-in-place** | Each upload is a new immutable row; "replace" = delete + re-upload. Version history adds schema + UI weight with no stated need. |
| **Max file COUNT per record** | No clinical reason to cap how many documents a case has. Storage pressure is better controlled by the per-file size cap now and a per-tenant storage quota later (Platform Console, mirrors the `maxPets` pattern) — not an arbitrary per-record count. |
| **Per-tenant storage quota enforcement** | Belongs to the Platform Console quota system (future), not this feature. Noted as a dependency/risk. |
| **Thumbnails / preview generation / image resizing / OCR / full-text index** | Display polish and search; not required to attach and retrieve. |
| **Drag-and-drop bulk multi-file upload** | v1 is one file at a time (a picker). Multi-file is a "Could". |
| **In-browser PDF/image annotation** | Anatomy annotation already exists separately (`anatomyAnnotation` on the record). Out of remit. |
| **Migrating the pet-photo upload flow** | `usePhotoUpload.ts` stays as-is; EMR gets its own hook. No refactor of working code. |

---

## 4. Open assumptions (made by @ba-agent, no human to confirm)

- **A1** — `clinic_admin` is intentionally **denied** `emr.attach` in the matrix (admin is config/management, not clinical). We do NOT add it. If admins are later expected to upload, they clone a role — not a matrix change here.
- **A2** — Clinical attachments are sensitive (PII/PHI-adjacent). The target design uses a **private bucket + `emr.view`-gated presigned GET** for download, not the pet-photo public-URL pattern. See design R5 — this is a genuine security upgrade over parity.
- **A3** — S3 storage is provisioned per the existing single-bucket env config (`config/storage.ts`); tenant isolation is by **key prefix**, not by bucket. This is the established pattern and is kept.
- **A4** — Deleting an attachment is blocked once the parent record has a paid invoice, mirroring the existing `updateMedicalRecord` billed-record guard (medico-legal evidence lock), and is audit-logged.
- **A5** — "and similar common clinic document types" is bounded to the §3.1 allow-list; anything outside it is a deliberate, security-driven exclusion, not an oversight.

---

## 5. Handoff

Proceed to the BA design doc for the MoSCoW requirement set, authorization design, gap analysis, AS-IS→TO-BE flow, and risk register. This brainstorm's decisions (§3) are inputs to that design.
