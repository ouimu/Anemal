# BA Validation & Sign-off — Unified Local-Disk Storage Driver (EMR Attachments + Pet Photos)

**Agent:** @ba-agent (Step 3 of Anemal pipeline)
**Date:** 2026-07-22
**Inputs reviewed:**
- Design: `docs/superpowers/specs/2026-07-22-emr-attachment-local-storage-design.md`
- Tasks/AC: `docs/superpowers/specs/2026-07-22-emr-attachment-local-storage-tasks.md`
**Skills applied:** `anemal-rbac-matrix`, `anemal-ba-toolkit`. Evidence gathered from live source + a read-only DB query.
**Gate role:** This sign-off gates Step 3.5 (`/grill-with-docs`) and Step 4 (`/write-plan`). Verdict at foot.

---

## 1. Objective (one sentence)

Repair the broken EMR-attachment upload (503 STORAGE_NOT_CONFIGURED) and the pet-photo upload by moving **both** real upload paths onto one pluggable `StorageDriver` with a private, authenticated, backend-streamed local-disk driver — designed so the deferred BYO-cloud driver reuses the whole abstraction, all serving routes, and the entire frontend.

**FR coverage:** FR-05 (EMR/Clinical — Must) attachment capability restored; FR-03 (CRM — Must, "full CRUD") pet-photo restored. Corrective in-phase work, not a new phase. Agree with PM scope framing (§0 of tasks).

---

## 2. Authorization design review (primary focus)

### 2.1 Declared route guards — all correct against the RBAC matrix

| Route | Guard declared | Matrix check | Verdict |
|---|---|---|---|
| `POST /medical-records/:id/attachments` (multipart upload) | `emr.attach` | admin E, doctor E, staff V(=holds code) | ✔ correct — unchanged from PR #41 route map |
| `GET /medical-records/:id/attachments/:attId/download` | `emr.view` | all 3 roles V | ✔ correct |
| `DELETE /medical-records/:id/attachments/:attId` | `emr.attach` | as above; billed-record block retained | ✔ correct — unchanged from PR #41 |
| `POST /pets/:id/photo` (multipart upload) | `crm.edit` | admin E, staff E, doctor denied | ✔ correct — photo is pet-data edit |
| `GET /pets/:id/photo` (authed stream) | `crm.view` | all 3 roles V | ✔ correct |
| `POST /upload/presign` (removed) | was `crm.edit` | route deleted | ✔ removal safe (see §5) |

**Plane isolation:** every route sits behind `authMiddleware` + `requirePlane('clinic')`; none is reachable by a platform token. No PII crosses to the platform plane. ✔

**Deny-by-default:** every new route carries an explicit `requirePermission`. No route left unguarded. ✔

### 2.2 Tenant isolation & BOLA

- **EMR upload/download/delete** — all funnel through `getMedicalRecord(tenantId, branchId, id)` which 404s on cross-tenant/cross-branch (ADR-0014 existence-leak precedent). Attachment lookups use `findAttachmentById(tenantId, medicalRecordId, attachmentId)` — tenant+record-scoped. ✔ Isolation intact and unchanged.
- **Key generation (EMR)** — the server builds the key (`tenants/{tid}/emr/{recId}/{uuid}-{safe}`); the client never supplies it in the new multipart flow. This *eliminates* the IDOR vector that PR #41's confirm-time `assertStorageKeyPrefix` defended. **Note for write-plan:** EMR-2's AC "storageKey-prefix mismatch → 404" no longer maps to a client-reachable vector (server owns the key) — keep it only as cheap defense-in-depth; the *primary* download controls are (a) tenant+record-scoped row lookup and (b) the driver path-traversal guard.
- **Path-traversal guard** — correctly treated as a trust-boundary control (design §4.2, STOR-1 AC). It stops `..` and absolute-path keys from escaping `baseDir`. ✔ **But it does NOT stop a well-formed in-baseDir key pointing at another tenant/module** (e.g. `tenants/999/photo/x` or `tenants/{me}/emr/5/y.pdf`). That residual is exactly the pet-photo hole below.

### 2.3 🔴 BLOCKING — pet-photo serve is a cross-tenant / cross-module arbitrary-file read

**Evidence (live source):**
- `pet.service.ts` — `createPetSchema` **and** `updatePetSchema` both accept `photoUrl: z.string().optional().nullable()`. `photoUrl` is **client-writable** today.
- Design §4.3b redefines `photoUrl` to hold a **private storageKey** and adds `GET /pets/:id/photo` → `driver.read(pet.photoUrl)`.
- The EMR side has `assertStorageKeyPrefix(tenantId, recordId, key)` (`emr-attachment.constants.ts`). **The pet side has no equivalent, and the design never removes `photoUrl` from the client-writable schema.**

**Exploit (in-tenant user with `crm.edit`, which staff/admin hold):**
1. `PUT /api/pets/:id { "photoUrl": "tenants/{OTHER_TENANT}/photo/{uuid}-x.jpg" }` — or `"tenants/{myTenant}/emr/{recordId}/{uuid}-labresult.pdf"`.
2. `GET /api/pets/:id/photo` → server `driver.read`s that key (well-formed, stays inside `baseDir`, so the traversal guard passes) and streams the bytes back.

Result: reads **another tenant's** files, and reads **EMR attachments without `emr.view`** — a confused-deputy BOLA that bypasses both tenant isolation and the EMR permission gate. This is the precise vector `assertStorageKeyPrefix` was built to stop, re-opened on the pet side.

**Required fix (design must adopt before write-plan — either or both):**
- **(a) Make `photoUrl` server-managed only** — remove `photoUrl` from `createPetSchema` and `updatePetSchema`; it is set *exclusively* by `POST /pets/:id/photo`. (Preferred — smallest surface, matches the "server is the security boundary" rule.) Update `AddPetModal`/`EditPetModal` to stop sending `photoUrl` in the pet body.
- **(b) Prefix-guard the serve read** — before `driver.read`, assert `pet.photoUrl.startsWith('tenants/{callerTenantId}/photo/')`, 404/400 otherwise (mirror `assertStorageKeyPrefix`). Recommended as defense-in-depth *in addition to* (a).

This is the one item that makes the design **not ready**. It is small and well-understood, but it must be in the plan.

### 2.4 Pet-photo serve — tenant scope requirement (must be explicit)

`GET /pets/:id/photo` and `POST /pets/:id/photo` **must fetch the pet through the tenant-scoped repository path** (same one `handleGetPet`/`getPet(tenantId, id)` uses) and 404 on cross-tenant — never a raw `findById`. PET-1/PET-2 AC #3 already assert cross-tenant 404; keep them and make the "fetch via tenant-scoped getter" explicit in the write-plan interface notes.

---

## 3. Gap analysis — AS-IS (S3) → TO-BE (local disk): capability parity

| S3 capability | Preserved in local-disk design? | Note |
|---|---|---|
| MIME allow-list (EMR) | ✔ | reuse `EMR_ATTACHMENT_MIME_ALLOWLIST` |
| Size cap 25 MB (EMR) | ✔ | reuse `EMR_ATTACHMENT_MAX_SIZE_BYTES` |
| MIME allow-list (photo: jpeg/png/webp) | ✔ | design §4.3b |
| Size cap (photo) | ⚠ placeholder "e.g. 5 MB" | firm value needed — see OQ-4 |
| `Content-Type` on serve | ✔ | driver returns mimeType; stored on `Attachment`/derivable |
| `Content-Disposition: attachment` (EMR, anti-inline-XSS) | ✔ must retain | ADR-0021 F2 rationale carries over — EMR downloads MUST force-download, not inline-render |
| **Filename safety (`sanitizeFilename`)** | 🟠 **at risk** | see §5 — lives in the file being deleted |
| Private objects, no public URL | ✔ improved | local disk has no public URL at all; correct end-state |
| Billed-record delete block (EMR) | ✔ | explicitly retained (EMR-3) |
| Best-effort orphan cleanup on delete | ✔ | carried over |

**No capability is dropped by moving off S3** provided the two ⚠/🟠 items (§5 sanitizeFilename, OQ-4 size cap) are handled. The private-serve model is a security *improvement*, not a regression.

### 3.1 🟠 "Audit ALL photoUrl display sites" — the design's enumeration is wrong in BOTH directions

Verified by `grep <img` + `grep photoUrl` across `src/frontend/src/views/clinic`:

| File | Design says touch? | Reality (evidence) | Action |
|---|---|---|---|
| `ClinicPets.tsx` | yes | Real renders at L528, L779 (grid + detail). L271/L398 are `photoPreview` = local object-URL from a freshly-selected `File`, **not** a storageKey | Convert L528/L779 to `AuthedPetImage`. **Leave L271/L398 unchanged** (would break upload preview). |
| **`ClinicEMR.tsx`** | **NOT listed** | **Real render at L528** `<img src={pet.photoUrl}>` (pet avatar in EMR header) | 🔴 **MISSING from PET-F3** — will silently break if not converted. **Add to the audit list.** |
| `ClinicBilling.tsx` | yes | **No pet-photo render at all** — only a PromptPay QR `<img>` (L389). Zero `photoUrl` usage. | 🟠 **Do not touch** — needless file churn (ponytail). |
| `ClinicAppointments.tsx` | yes | Only an interface type decl `photoUrl?: string` (L19). No `<img>`. | 🟠 No render change needed. |
| `ClinicInpatient.tsx` | (design §4.4 lists it) | Only interface type decl (L25). No `<img>`. | 🟠 No render change needed. |

**Resolution of OQ-8:** Billing/Appointments/Inpatient do **not** render pet photos today — the grep hits are interface declarations, not display sites. The genuinely missing display site is **`ClinicEMR.tsx`**. PET-F3's enumeration must be corrected to `{ClinicPets.tsx (L528, L779), ClinicEMR.tsx (L528)}` and must explicitly exempt the `photoPreview` sites. The PET-F3 "grep at task-start" safety net would catch ClinicEMR, but the design's stated list is misleading and must be fixed so the plan doesn't (a) miss the EMR avatar or (b) burn touches on three no-op files.

---

## 4. Eight open questions — BA disposition

| # | Question | BA recommendation | Blocker? |
|---|---|---|---|
| 1 | Pet-create-then-upload partial failure UX | Pet is valid without a photo. On photo-step failure: **keep the created pet**, show a non-blocking "Pet saved — photo upload failed, retry from Edit" toast. Do not roll back the pet. Finalize copy in write-plan. | No — resolve in write-plan |
| 2 | `photoUrl` semantic change (URL→key), data integrity | **DB verified: 5 pets, 0 non-null `photoUrl`** — zero legacy values, no migration, no legacy-value behavior needed in this env (see §6). Keep the column name for now (no rename); a `photoKey` rename is optional clarity, defer. **This item is safe *only once* the §2.3 fix lands** (server-managed photoUrl). | Tied to §2.3 blocker |
| 3 | Old-photo cleanup on re-upload | **Delete the previous key (best-effort) on replace** in `POST /pets/:id/photo`. Local disk has no GC; unbounded orphans otherwise. Cheap, decide now. | No — but specify in PET-1 |
| 4 | Photo size cap value | Fix at **5 MB** (matches design intent; well under EMR's 25 MB). Make it a named constant. | No — set the number in write-plan |
| 5 | `@aws-sdk/*` removal safety | **Verified by grep:** the only importers are `config/storage.ts`, `upload.service.ts`, `emr-attachment.service.ts`, and two test files — all deleted or rewritten by Groups B/C/PET-3. Safe to remove after those land. (Design §4.1's claim that `config/storage.ts` is used *only* by pet-photo presign is **factually wrong** — `emr-attachment.service.ts` imports it too; outcome unchanged, but correct the statement.) | No — confirmed safe |
| 6 | Disk volume growth on local disk | Out of scope (testing-only). One-line risk note in the ADR. Agree. | No |
| 7 | Concurrent photo-replace race | Last-write-wins on `photoUrl`; combined with #3, a simultaneous double-upload can orphan one file. Acceptable for testing-only local disk; note in ADR. | No |
| 8 | Do Billing/Appointments actually show a photo? | **Resolved in §3.1: no.** Do not touch them. The real gap is ClinicEMR. | No — resolved here |

None of OQ 1/3/4/6/7 blocks sign-off; each needs an explicit decision folded into write-plan (grill may pressure-test 1, 3, 7). OQ-2 and OQ-8 are resolved above with evidence.

---

## 5. 🟠 Additional gap — `sanitizeFilename` must be relocated, not deleted

`emr-attachment.service.ts` (L8) imports `sanitizeFilename` from `upload.service.ts`. PET-3 deletes `upload.service.ts` wholesale. `sanitizeFilename` is a **filename-safety control** (strips path chars, caps length) used to build safe storage keys — part of the S3→local capability parity in §3. If it's deleted with `upload.service.ts`, the rewritten EMR/pet key-builders lose it.

**Required:** relocate `sanitizeFilename` (e.g. into `emr-attachment.constants.ts` or a small shared `storage-util`) before/when `upload.service.ts` is deleted, and repoint both key-builders at it. Add to STOR-1 or a dedicated task; add an AC that filename sanitization is applied on both EMR and pet key construction.

---

## 6. `photoUrl` data-integrity assessment (URL→storageKey)

- **Query run (read-only):** `SELECT COUNT(*), COUNT("photoUrl"), COUNT(*) FILTER (WHERE "photoUrl" LIKE 'http%') ... FROM "pets"` → **total 5, non-null 0, http 0, non-http 0.**
- **Conclusion:** no existing value to reinterpret; the URL→storageKey change breaks nothing in this environment. No migration required. The `EditPetModal.test.tsx` `https://cdn.example.com/...` value is a **test fixture**, not persisted data.
- **Pilot/staging caveat (for the ADR):** if any pilot tenant later carries a real `http…` `photoUrl`, the new authed-serve path would treat it as a storage key and 404 (file-missing). Since none exist here, no compat shim is warranted now — but the ADR must record that **any environment with legacy `http` photoUrl values must be checked before deploy** (re-run the count query; if >0, null them or add a one-off `http→404-placeholder` handling). This ties to OQ-2.

---

## 7. NFR impact

- **Performance:** driver `read()` is full-buffer (design §4.1) — fine at 25 MB EMR / 5 MB photo scale for testing; streaming deferred (YAGNI, acceptable). Note in ADR for the cloud driver.
- **Availability/Ops:** `ATTACHMENT_DIR` must be a persistent, backed-up volume; losing it loses all files while DB rows survive → the "data drift" 404 path (handled). Operator concern, documented in §9 of design + memory note.
- **Security:** net improvement (private-only, no public URLs) **once §2.3 is closed**. `multer` memory storage is the standard, no stdlib equivalent — Ponytail-acceptable (net −1 dependency).
- **Maintainability:** 4-method driver interface, one implementation — clean seam for the cloud swap. ✔

---

## 8. Risk register (new/changed)

| ID | Risk | Sev | Mitigation | Owner |
|---|---|---|---|---|
| R-1 | Client-writable `photoUrl` → cross-tenant/cross-module file read | **High** | §2.3 fix (server-managed photoUrl + serve-time prefix guard) | dev, **must be in plan** |
| R-2 | ClinicEMR pet avatar silently breaks (missed audit site) | Med | Correct PET-F3 enumeration; convert ClinicEMR L528 | dev |
| R-3 | `sanitizeFilename` lost on `upload.service.ts` delete | Med | Relocate before delete (§5) | dev |
| R-4 | Orphan files accumulate (re-upload/race) | Low | Best-effort delete-old (OQ-3); ADR note (OQ-6/7) | dev |
| R-5 | Local disk shipped to prod by mistake (no per-tenant privacy) | High (pre-prod) | Design §9 gate + memory note `emr-storage-local-then-cloud`; ADR consequences | pm/operator |
| R-6 | Legacy `http` photoUrl in a future pilot env | Low | Pre-deploy count check in ADR (§6) | operator |

---

## 9. Definition-of-Ready check

| Criterion | Status |
|---|---|
| Objective stated | ✔ |
| Actors/roles named | ✔ (emr.attach/emr.view, crm.edit/crm.view) |
| Permission codes assigned & correct | ✔ (gates verified §2.1) |
| Business rules / isolation listed | ⚠ — **incomplete until §2.3 pet-photo prefix rule is added** |
| Exceptions covered | ✔ (§6 error handling of design; OQ dispositions) |
| NFR impact noted | ✔ (§7) |
| Acceptance criteria testable | ✔ mostly — needs correction to PET-F3 list + new ACs for §2.3, §5 |
| Risks & dependencies recorded | ✔ (§8) |

Not fully ready: three required corrections (R-1/§2.3, R-2/§3.1, R-3/§5) must be folded into the design/tasks before `/write-plan`.

---

## 10. Verdict & required actions before Step 3.5/4

The design is fundamentally sound — correct plane/permission gates, correct EMR isolation, sensible driver seam, private-serve model that is the right cloud end-state, and empirically zero legacy `photoUrl` data. It is **not yet ready** because it re-opens a cross-tenant/cross-module read hole on the pet side and mis-enumerates the frontend audit.

**Must resolve before `/write-plan` (carry into `/grill-with-docs`):**
1. **(R-1, §2.3)** Close the client-writable-`photoUrl` read hole: make `photoUrl` server-managed (drop from `createPetSchema`/`updatePetSchema`; stop the modals sending it) **and** add a `tenants/{tenantId}/photo/` prefix guard on the photo-serve read. Add the matching ACs.
2. **(R-2, §3.1)** Correct PET-F3's display-site list to `{ClinicPets L528/L779, ClinicEMR L528}`; explicitly exempt the `photoPreview` sites; drop ClinicBilling/ClinicAppointments/ClinicInpatient (no pet-photo render — verified).
3. **(R-3, §5)** Relocate `sanitizeFilename` out of the to-be-deleted `upload.service.ts` and apply it to both key-builders; add an AC.

**Should decide (in grill/write-plan, non-blocking):** OQ-1 partial-failure UX, OQ-3 old-photo cleanup, OQ-4 firm 5 MB cap; record OQ-6/7 orphan/volume + OQ-2 legacy-value caveat in the ADR.

---

**BA SIGN-OFF: BLOCKED — (1) pet-photo serve reads a client-writable `photoUrl` with no tenant/module prefix guard = cross-tenant + cross-module (EMR) arbitrary-file read; make `photoUrl` server-managed + add serve-time prefix guard. (2) PET-F3 audit list is wrong: it omits the real render site `ClinicEMR.tsx` and includes three files (ClinicBilling/ClinicAppointments/ClinicInpatient) that render no pet photo. (3) `sanitizeFilename` (filename-safety control) is deleted with `upload.service.ts` but still needed by both key-builders — relocate it. All other routes/gates, EMR isolation, and the URL→storageKey change (DB-verified: 0 legacy values) are APPROVED; fold the three fixes in, then proceed to /grill-with-docs.**
