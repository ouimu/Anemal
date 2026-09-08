# Screen Spec: Pet & Owner Management
> Prototype: `design_prototype/pet_owner_management_1024x768/code.html`
> Component: `src/frontend/src/views/clinic/ClinicPets.tsx`
> Status: **Implemented** (Phase 2) — spec written retroactively 2026-06-10 from prototype + shipped component

---

## Layout

```
pt-16 pl-56 (or pl-14 collapsed) — via ClinicLayout main offset
Root: flex h-full — master/detail split
  ├─ Left panel:  w-72 flex-shrink-0 border-r border-outline-variant flex flex-col bg-surface overflow-hidden
  └─ Right panel: flex-1 flex flex-col overflow-hidden
```

---

## Left panel (patient list)

```
Search (p-md border-b border-outline-variant):
  relative wrapper, icon `search` size=18 absolute left-3
  input: w-full bg-surface-container-low rounded-full py-sm pl-10 pr-md text-body-sm
         border-none focus:ring-2 focus:ring-primary min-h-[44px]
  Placeholder: "Search pets, owners, phone…"

Species filter chips (flex gap-sm p-md border-b overflow-x-auto):
  All · Canine · Feline · Other
  Active:   px-md py-xs rounded-full text-label-md font-medium min-h-[36px] bg-primary text-primary-on
  Inactive: same + bg-surface-container text-on-surface-variant hover:bg-surface-container-high

"New Owner" button (p-md border-b):
  w-full flex items-center justify-center gap-sm bg-surface border border-outline-variant
  rounded-lg px-md py-sm min-h-[44px] text-body-sm font-semibold hover:bg-surface-container-low
  Icon: person_add size=18

Pet list (flex-1 overflow-y-auto):
  Row (button, min-h-[72px]):
    w-full text-left flex items-center gap-md p-md border-b border-outline-variant/50
    Selected: bg-surface-container-low border-l-4 border-primary
    Idle:     hover:bg-surface-container-low border-l-4 border-transparent
  Avatar: w-12 h-12 rounded-full bg-surface-container-high — photo (object-cover) or icon `pets` size=22
  Line 1: pet name — text-headline-xs font-bold truncate
  Line 2: owner name — text-body-sm text-on-surface-variant truncate
  Line 3: species chip (see below)
  Empty state: "No pets found." — p-lg text-body-sm text-on-surface-variant
```

### Species chip colors

| Species | Classes |
|---|---|
| `canine` | `bg-secondary-container text-secondary-on-container` |
| `feline` | `bg-primary-fixed text-on-surface` |
| other | `bg-surface-container-high text-on-surface-variant` |

Chip shape: `px-sm py-xs rounded-full text-label-md capitalize`

---

## Right panel (pet profile)

```
Empty state (no selection):
  flex-1 flex flex-col items-center justify-center text-center p-xl text-on-surface-variant
  Icon pets size=64 opacity-20 · "Select a patient" text-headline-sm font-headline font-bold

Header bar: flex items-center justify-between px-lg py-md border-b border-outline-variant bg-surface
  H2 "Pet Profile": text-headline-sm font-headline font-bold text-primary
  "Add Pet" CTA: flex items-center gap-sm bg-primary text-primary-on rounded-lg px-lg py-sm
                 min-h-[44px] text-body-sm font-semibold hover:bg-primary/90 — icon add size=18

Detail body: flex-1 overflow-y-auto p-lg flex flex-col gap-lg
```

### Pet hero card

```
flex items-center gap-lg bg-surface rounded-xl border border-outline-variant p-lg

Photo: w-[120px] h-[120px] rounded-xl object-cover border border-outline-variant
  (fallback: bg-surface-container-high + icon pets size=48)
Name: text-headline-md font-headline font-bold text-primary
Chips row (flex flex-wrap gap-sm mt-sm): species chip + breed/age/gender as
  px-sm py-xs rounded-full bg-surface-container text-on-surface-variant text-label-md
Microchip: text-body-sm text-on-surface-variant, icon qr_code_scanner size=14 inline
```

### Owner card

```
bg-surface-container-low rounded-xl p-lg flex items-center gap-lg border border-outline-variant
Avatar: w-12 h-12 rounded-full bg-primary text-primary-on font-bold text-headline-xs (initials)
Name: font-semibold text-body-md · phone/email: text-body-sm text-on-surface-variant
```

### Medical alerts banner (conditional)

```
bg-error-container rounded-xl p-lg border border-error/30
Allergies: text-body-sm font-semibold text-error — icon warning size=16 inline
Conditions: text-body-sm text-error mt-xs — icon medical_information size=16 inline
```

### Tabs: Overview · Medical · Vaccinations

```
Tab bar: flex border-b border-outline-variant
  Active:   px-lg py-sm text-body-sm font-semibold min-h-[44px] border-b-2 border-primary text-primary
  Inactive: text-on-surface-variant hover:text-on-surface

Overview: key/value rows — flex justify-between items-center min-h-[48px] border-b border-outline-variant/50 py-sm
  Rows: Weight (kg) · Color · Date of birth — "—" when empty

Medical: same row pattern — assessment text + createdAt date (latest 3 records)
  "View all in EMR" link (Can perm="emr.view"): navigates to ClinicEMR.tsx?petId=<id>, pre-selecting the pet
  Empty (emr.view held): "No medical records yet."
  Empty (emr.view absent — server omits the field): "You don't have access to clinical records."

Vaccinations:
  "Add Vaccination" button (flex justify-end mb-md): bg-primary CTA pattern, icon add size=18 —
    only rendered when the vaccinations field is present (i.e. server included it for emr.view)
  Row: vaccine name (font-medium) + "Due: <date>" (text-label-md) | administered date right-aligned
  Empty (emr.view held): "No vaccination records yet."
  Empty (emr.view absent — server omits the field): "You don't have access to clinical records."
```

### EMR drill-in + emr.view degradation (PET-MED-1, PET-MED-2)

`GET /api/pets/:id` gates the `medicalRecords`/`vaccinations` fields on the
caller's `emr.view` permission (resolved server-side in
`pet.controller.ts::handleGetPet`, passed through `pet.service.getPet` to
`pet.repository.findPetById`'s conditional Prisma `include`). Callers without
`emr.view` get the pet's core fields but neither clinical array — the fields
are omitted entirely, not returned empty, so the frontend can distinguish
"no records yet" from "no access." The Medical tab's "View all in EMR" link
(itself gated on `emr.view`) navigates to `/clinic/emr?petId=<id>`, which
`ClinicEMR.tsx` reads on mount to pre-select that patient.

---

## Modals (all share the standard pattern)

```
Overlay: fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-lg
Dialog:  bg-surface rounded-xl shadow-lg w-full max-w-md p-xl  (Add Pet adds overflow-y-auto max-h-[90vh])
Title:   text-headline-sm font-headline font-bold text-primary mb-lg
Inputs:  bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-md
         border border-outline-variant focus:ring-2 focus:ring-primary
Textareas: min-h-[80px] resize-none
Footer:  flex gap-md pt-sm — Cancel (border border-outline-variant) + Save (bg-primary text-primary-on), both flex-1 min-h-[44px]
```

| Modal | Fields |
|---|---|
| New Owner | firstName* + lastName* (side by side) · phone* · email · address · lineId |
| New Pet | name* · species select (canine/feline/avian/other) + gender select · breed + color · birthDate (date) · microchipId · allergies (textarea) · underlyingConditions (textarea) |
| Record Vaccination | vaccineName* · administeredAt* (date) · nextDueAt (date) · batchNo |

---

## Behaviour / API

| Action | Call | Notes |
|---|---|---|
| List pets | `GET /api/pets?q=<search>&species=<filter>&limit=50` | Query key `['pets', search, speciesFilter]`, staleTime 30s |
| Pet detail | `GET /api/pets/:id` | Includes owner always; vaccinations + medicalRecords (latest 3) only when caller has `emr.view` — key `['pet', petId]` |
| Create owner | `POST /api/owners` | Optional fields sent as `null` |
| Create pet | `POST /api/pets` | Requires `ownerId` (from selected pet's owner) |
| Record vaccination | `POST /api/vaccinations` | `{ petId, vaccineName, administeredAt, nextDueAt?, batchNo?, notes? }` |

After any save: invalidate `['pets']` (and `['pet', id]` when a pet is selected), close modal.

---

## Deferred items

- Photo upload goes through the pluggable storage-driver layer (`src/backend/config/storage-driver.ts`,
  `src/backend/services/storage-config.service.ts`) — see ADR-0022 (unified local disk) and ADR-0023
  (per-tenant network share). The earlier S3 pre-signed `upload.service.ts` and its
  `STORAGE_NOT_CONFIGURED` code no longer exist; current storage errors are `STORAGE_UNAVAILABLE`,
  `STORAGE_FILE_NOT_FOUND`, `STORAGE_KEY_PATH`, `STORAGE_SWITCH_CONFIRMATION_REQUIRED`.
  Camera-barcode capture remains deferred (not built).
- Owner edit modal (create-only today) — pet edit is implemented (`EditPetModal`, gated on `crm.edit`)
- LINE userId capture on the owner form (Session G dependency)
