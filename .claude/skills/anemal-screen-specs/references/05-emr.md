# Screen Spec: EMR (Electronic Medical Records)
> Prototype: `design_prototype/emr_1024x768/code.html`
> Component: `src/frontend/src/views/clinic/ClinicEMR.tsx`
> Status: **Implemented** (Phase 2) — spec written retroactively 2026-06-10 from prototype + shipped component

---

## Layout — 3-column workspace

```
pt-16 pl-56 (or pl-14 collapsed) — via ClinicLayout main offset
Root: flex h-full overflow-hidden
  ├─ Left sidebar:   w-56 flex-shrink-0 border-r border-outline-variant bg-surface (patient + visit list)
  ├─ Center:         flex-1 flex flex-col overflow-hidden (SOAP editor)
  └─ Right panel:    w-72 flex-shrink-0 border-l border-outline-variant bg-surface
                     (attachments + prescriptions — only when a record is open)
```

---

## Left sidebar — patient selection

```
Find Patient block (p-md border-b border-outline-variant):
  Label: text-body-sm font-semibold text-on-surface-variant mb-sm
  Search input: w-full bg-surface-container-low rounded-lg py-sm pl-9 pr-md min-h-[44px]
    text-body-sm border border-outline-variant focus:ring-2 focus:ring-primary
    icon `search` size=16 absolute left-3
  Results dropdown: mt-sm bg-surface border border-outline-variant rounded-lg shadow-lg max-h-40 overflow-y-auto
    Row (min-h-[44px]): pet name font-medium + owner name text-label-md text-on-surface-variant
    Click → select pet, clear search, reset form

Selected pet block (p-md border-b):
  Avatar w-10 h-10 rounded-full (photo or icon pets size=20 on bg-surface-container-high)
  Name text-body-sm font-bold · species text-label-md capitalize
  "New EMR" CTA: w-full min-h-[44px] bg-primary text-primary-on rounded-lg
    text-body-sm font-semibold — icon add size=18

Recent visits (flex-1 overflow-y-auto) — last 5 records:
  Row (min-h-[52px]): assessment (or "Visit") text-body-sm font-medium truncate + date text-label-md
  Selected: bg-surface-container-low border-l-4 border-primary
  Idle:     hover:bg-surface-container-low border-l-4 border-transparent
```

---

## Center — SOAP editor

```
Empty state (no pet/record): centered, icon medical_services size=64 opacity-20,
  "EMR Editor" text-headline-sm font-headline font-bold

Patient header bar: bg-surface-container-low border-b border-outline-variant px-lg py-md
  flex items-center gap-md — pet name (text-body-md font-bold) · owner · phone
  Allergy chip (right, ml-auto): px-md py-xs rounded-full bg-error-container text-error
    text-label-md font-medium — icon warning size=14 inline

SOAP tab bar: flex border-b border-outline-variant bg-surface
  Tabs: Subjective · Objective · Assessment · Plan
  Active:   px-lg py-sm text-body-sm font-semibold min-h-[44px] border-b-2 border-primary text-primary
  Inactive: text-on-surface-variant hover:text-on-surface

Tab body: flex-1 overflow-y-auto p-lg flex flex-col gap-lg
  S / A / P tabs: single textarea —
    w-full bg-surface-container-low rounded-xl px-lg py-md text-body-md
    border border-outline-variant focus:ring-2 focus:ring-primary min-h-[200px] resize-none
  Placeholders: "Chief complaint…" / "Diagnosis, differential diagnosis…" / "Treatment plan, follow-up…"

Sticky save bar (bottom): border-t border-outline-variant bg-surface px-lg py-md flex items-center gap-md
  Save message: text-success ("Saved") or text-error
  Save CTA (right): min-h-[44px] px-xl bg-primary text-primary-on rounded-lg
    text-body-sm font-semibold disabled:opacity-50 — icon save size=18
```

### Objective tab — vitals + exam + anatomy canvas

```
Vital Signs — flex flex-wrap gap-md of VitalStepper components:
  Weight (kg, step 0.1) · Temp (°C, step 0.1) · Heart Rate (bpm, step 1) · Resp Rate (rpm, step 1)
  Stepper anatomy: flex flex-col items-center gap-xs bg-surface-container-low rounded-xl p-md min-w-[90px]
    − / + buttons: min-h-[44px] min-w-[44px] rounded-lg bg-surface border border-outline-variant text-headline-sm font-bold
    Value: text-headline-xs font-bold min-w-[48px] text-center ("—" when null)
  Touch-first: steppers instead of keyboard input (Tablet UI rule)

Physical Examination Notes: textarea (same pattern, min-h-[120px])
```

### Anatomy canvas (stylus annotation)

```
Template chips (flex gap-sm flex-wrap): "Canine - Lateral" · "Canine - Dorsal" · "Feline - Lateral"
  Active:   px-md py-xs rounded-full text-label-md font-medium min-h-[36px] bg-primary text-primary-on
  Inactive: bg-surface-container text-on-surface-variant hover:bg-surface-container-high

Tool row: 3 pen-color swatch buttons (w-8 h-8 rounded-full border-2;
    selected = border-primary scale-110, else border-outline-variant)
  + Eraser toggle (icon ink_eraser size=16) + Clear button — both min-h-[36px] chip style

Canvas frame: bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant
  Caption bar: p-md text-center text-label-md text-on-surface-variant border-b
  <canvas width=400 height=200 class="w-full touch-none cursor-crosshair">
  Pointer events (pen/finger/stylus): pointerdown → beginPath, pointermove → stroke
    (lineWidth 2, lineCap round) or 20×20 clearRect for eraser, pointerup → serialize

Persistence: saved as JSON `{ template, imageData: canvas.toDataURL() }`
  in `anatomyAnnotation` field of the medical record.

⚠️ Token exception (documented): PEN_COLORS uses literal hex values because
  ctx.strokeStyle requires literals — they mirror the error / on-surface / info tokens
  from tailwind.config.js. Do not add more literals; extend from config tokens.
```

---

## Right panel — attachments + prescriptions (`w-72`)

```
Attachments (p-lg border-b border-outline-variant):
  Row (min-h-[44px]): icon attach_file size=16 + filename link (text-body-sm text-primary
    hover:underline, opens new tab) + fileType chip (text-label-md bg-surface-container rounded-full)
  Empty: "No attachments yet." text-label-md text-on-surface-variant

Prescriptions (flex-1 overflow-y-auto p-lg):
  Gate: "Save the EMR first to add prescriptions." until the record exists.

  Existing row (min-h-[48px] border-b border-outline-variant/50):
    drug name text-body-sm font-medium · "qty unit · instruction" text-label-md
    Delete button: min-h-[44px] min-w-[44px] text-error hover:bg-error-container rounded-lg — icon delete size=18

  Add drug flow:
    Search input: "Search drug by name or barcode…" (standard 44px input)
    Selected drug chip: bg-surface-container-low rounded-lg — icon medication size=16 text-secondary,
      stock badge: in stock `bg-success/10 text-success` · out `bg-error-container text-error`
    Quantity stepper: −/+ 44px buttons + count (text-headline-xs font-bold min-w-[48px])
    Dosage instructions input
    Submit: w-full min-h-[44px] bg-secondary text-secondary-on rounded-lg text-body-sm font-semibold
```

---

## Behaviour / API

| Action | Call | Notes |
|---|---|---|
| Patient search | `GET /api/search?q=<term>` | enabled at ≥2 chars, staleTime 15s |
| Pet detail | `GET /api/pets/:id` | header bar + allergy chip |
| Recent visits | `GET /api/medical-records?petId=N&limit=5` | left sidebar list |
| Record detail | `GET /api/medical-records/:id` | loads SOAP + vitals + anatomy into form |
| Create record | `POST /api/medical-records` | `{ petId, doctorId, subjective, objective, assessment, plan, weightKg, temperatureC, heartRateBpm, respRateRpm, anatomyAnnotation }` — returned id becomes current record |
| Update record | `PUT /api/medical-records/:id` | same body |
| Add prescription | `POST /api/prescriptions` | `{ medicalRecordId, drugId, quantity, unit, dosageInstruction }` — backend auto-deducts `branch_inventory` stock |
| Remove prescription | `DELETE /api/prescriptions/:id` | restocks |

State flow: select pet → "New EMR" (blank form, `isNewRecord`) or pick a recent visit →
first save POSTs and switches to update mode → prescriptions panel unlocks.

---

## Deferred items

- `doctorId` is hardcoded to `1` on save — should come from auth store (`useAuthStore` user id)
- Drug search input is not wired to a query (selection currently requires the barcode flow planned in Session D)
- Attachment upload UI (list/display only — S3 presign in Session E)
- Lab/X-ray attachment capture, SVG anatomy templates per species (current canvas is freehand-only over a caption)
