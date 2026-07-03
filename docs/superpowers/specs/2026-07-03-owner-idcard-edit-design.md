# Owner ID Card + Edit/Delete Owner — Design Spec

**Date:** 2026-07-03
**Status:** Approved (brainstorm), pending write-plan
**Screen:** Pets & Owner (`src/frontend/src/views/clinic/ClinicPets.tsx`)

## Context

This is sub-project 1 of 3 decomposed from a combined "Pets & Owner Screen" bug/feature list (see [Origin Requests](#origin-requests)). Each sub-project gets its own brainstorm → BA sign-off → grilling → write-plan → Ponytail gate → execute-plan cycle per `CLAUDE.md`.

**Decomposition (build order):**
1. **Owner ID Card + Edit/Delete Owner** ← this spec
2. Pet Hospital Number (H/N) auto-generation
3. Pet Species catalogue + Edit/Delete Pet

Sub-projects 2 and 3 are out of scope for this spec and will get their own design docs.

## Current State (verified in code)

- `Owner` model (`schema.prisma:222`): no `idCardType`/`idCardNumber` field. Has `isActive` (unused by this screen — no delete UI exists).
- `PUT /api/owners/:id` already exists, gated by `crm.edit` — backend edit support already present, only frontend UI is missing.
- No `DELETE /api/owners/:id` route exists. Permission `crm.delete` already exists in the seeded catalogue (`seed-rbac.ts:34`) and is already granted to the admin role, but not wired to any route.
- `OwnerPanel` (ClinicPets.tsx) renders full owner info (name, phone, email, address) — this already works correctly.
- `PetDetail`'s owner card (ClinicPets.tsx:286-297) renders **only** name, phone, email — missing address and (new) ID card.

## Data Model

```prisma
model Owner {
  // ...existing fields...
  idCardType   String?  @db.VarChar(10)  // 'thai_id' | 'passport'
  idCardNumber String?  @db.VarChar(20)

  @@unique([tenantId, idCardNumber])
}
```

- Both fields nullable; Postgres unique index permits multiple `NULL` rows, so owners without an ID card are unaffected.
- `idCardType` and `idCardNumber` are both-or-neither: if one is set, the other must be too (service-layer validation).

## Validation Rules

| Type | Rule |
|---|---|
| `thai_id` | `^\d{13}$` **and** passes Thai national ID mod-11 checksum on the 13th digit |
| `passport` | 6–20 alphanumeric characters, no format/checksum validation (passport formats vary too widely by country) |

**Uniqueness:** `idCardNumber` must be unique among owners within the same `tenantId` (cross-branch, cross-company duplicates are allowed — i.e. only tenant-scoped, not global). Enforced in `owner.service.ts` before create/update: query for an existing owner with the same `tenantId + idCardNumber` (excluding the current owner's id on update). Conflict → `409` with a clear error message.

## API Changes

- `POST /api/owners` — extend `createOwnerSchema` with optional `idCardType` (`enum('thai_id','passport')`) and `idCardNumber` (string), both-or-neither refinement, uniqueness check in service.
- `PUT /api/owners/:id` — same extension on `updateOwnerSchema`; uniqueness check excludes self.
- `DELETE /api/owners/:id` — **new route**, `requirePlane('clinic')` + `requirePermission('crm.delete')`.
  - Soft delete: sets `isActive = false`.
  - **Blocks with `409`** if the owner has any `isActive = true` pets — staff must reassign or deactivate those pets first (deactivating pets is sub-project 3's concern; for now this just means the owner delete is blocked until pets are handled some other way, e.g. directly in DB or a future screen).

## Frontend Changes

**`AddOwnerModal`** (ClinicPets.tsx:36-78):
- Add a card-type select (`—` / `Thai National ID` / `Passport`).
- Add a conditional text input for the number: `maxLength=13` + numeric-only hint for `thai_id`, more permissive for `passport`.
- Both optional; omitted entirely if type is `—`.

**`EditOwnerModal`** (new):
- Same field shape as `AddOwnerModal`, prefilled from the currently-loaded owner.
- Submits `PUT /api/owners/:id` instead of `POST /api/owners`.
- Reuse styling/structure from `AddOwnerModal` (extract shared field-rendering if it keeps the diff small; do not over-abstract if it's just a few duplicated inputs).

**`OwnerPanel`** (ClinicPets.tsx:372-429):
- Add Edit (pencil) and Delete (trash) icon buttons near the owner header, gated by `Can perm="crm.edit"` / `Can perm="crm.delete"` respectively.
- Delete requires a confirmation step (simple confirm dialog) before calling `DELETE /api/owners/:id`.
- On delete-blocked 409, show the server's error message (e.g. "Cannot delete: owner has active pets").

**`PetDetail`'s owner card** (ClinicPets.tsx:286-297):
- Extend to also render `owner.address` and, if present, `owner.idCardType` + `owner.idCardNumber`.

## Data Flow

- **Edit:** click pencil → `EditOwnerModal` opens prefilled from the already-loaded `['owner', ownerId]` query data → submit → `PUT` → invalidate `['owner', ownerId]` and `['owners']` → close modal.
- **Delete:** click trash → confirm → `DELETE /api/owners/:id` → on success invalidate `['owners']`, clear `selectedOwnerId` (and `selectedPetId` if set), UI falls back to the "Select an owner" empty state. On 409, show inline error, do not close.

## Error Handling

- Uniqueness conflict (`idCardNumber` already used by another owner in tenant) → `409`, surfaced in the modal's existing error `<p>` element (same pattern as current `AddOwnerModal`/`AddPetModal`).
- Delete blocked by active pets → `409`, surfaced near the delete button.
- Invalid checksum / bad format → `400` from zod validation, surfaced the same way as existing validation errors.

## Testing

**Backend:**
- `thai_id` checksum validation: valid ID passes, invalid checksum rejected, wrong length rejected.
- `passport`: any 6-20 alphanumeric string accepted, too short/too long rejected.
- Both-or-neither: type without number (and vice versa) rejected.
- Uniqueness: duplicate `idCardNumber` within tenant rejected on create and on update (excluding self); same number in a different tenant allowed.
- `DELETE /api/owners/:id`: requires `crm.delete`; succeeds and sets `isActive=false` when no active pets; returns `409` when active pets exist; tenant isolation (cannot delete another tenant's owner).
- `GET /api/owners/:id` and list: response includes `idCardType`/`idCardNumber` when present.

**Frontend:**
- Card-type select toggles the number input's placeholder/maxLength.
- `EditOwnerModal` prefills correctly and calls `PUT` with the edited values.
- Delete button hidden without `crm.delete`; confirm-then-delete flow; 409 shows inline error without navigating away.
- `PetDetail` owner card shows `—` for missing address/ID card, consistent with the existing empty-value convention used in the Overview tab.

## Origin Requests

Original user-supplied list this decomposition traces back to:

**Owner Section**
1. New Owner → Add field ID Card 13 digits (Optional) — **this spec**
2. Display Owner → No Owner information showing — clarified as: PetDetail's owner card was missing address/ID card — **this spec**
3. Cannot edit Owner Information → build Edit Owner — **this spec** (+ Delete, added mid-brainstorm)

**Pet Section** (deferred to sub-projects 2 & 3)
1. Add field H/N for Pet → sub-project 2
2. Species = Other → reusable species catalogue with add/edit/delete → sub-project 3
3. Cannot edit any pet information → Edit Pet + Delete Pet → sub-project 3
