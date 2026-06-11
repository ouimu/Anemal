---
plan: 01C
phase: 1
wave: 2
depends_on:
  - 01A
  - 01B
files_modified:
  - src/frontend/src/views/settings/ClinicProfilePage.tsx
autonomous: true
requirements:
  - CLINIC-02
  - UX-01
  - UX-02
  - UX-03

must_haves:
  truths:
    - "Logo drag-and-drop zone renders in the Clinic Profile form; dragging an image file over it highlights the zone"
    - "Selecting a PNG/JPG file under 500KB via click or drag-drop replaces the logo preview with the local image"
    - "Selecting a file over 500KB shows inline error 'Logo must be under 500KB' and does not update the preview"
    - "The logoUrl data-URL is included in the form payload when Save Changes is clicked"
    - "All interactive elements on the Clinic Profile page have min-h-[44px] min-w-[44px]"
    - "Page renders without horizontal scroll at 768px viewport width"
    - "Page renders without horizontal scroll at 1024px viewport width"
  artifacts:
    - path: "src/frontend/src/views/settings/ClinicProfilePage.tsx"
      provides: "Clinic Profile page with logo upload, touch targets, and responsive layout"
      contains: "onDragOver"
  key_links:
    - from: "ClinicProfilePage logo zone"
      to: "FileReader.readAsDataURL"
      via: "handleLogoChange / handleDrop calling FileReader"
      pattern: "readAsDataURL"
---

<objective>
Extend `ClinicProfilePage.tsx` with three polish concerns:
1. Logo upload — drag-and-drop zone + file input with FileReader preview (CLINIC-02)
2. Touch target audit — verify all interactive elements have `min-h-[44px] min-w-[44px]` (UX-02)
3. Responsive layout audit — ensure no horizontal scroll at 768px and 1024px (UX-03)

This plan delivers Success Criterion 3. It modifies only `ClinicProfilePage.tsx`;
all other files from Plans 01A and 01B are untouched.

Purpose: Closes the remaining Phase 1 requirements (CLINIC-02, UX-01–03) that
could not be vertically sliced into Plan 01B without making that plan too large.

Output: Updated `ClinicProfilePage.tsx` with logo upload section and responsive
layout verified.
</objective>

<execution_context>
@D:\Development\AnimalClinic\.planning\phases\01-settings-shell-clinic-profile\01-RESEARCH.md
</execution_context>

<context>
@D:\Development\AnimalClinic\.planning\ROADMAP.md
@D:\Development\AnimalClinic\.planning\REQUIREMENTS.md
@D:\Development\AnimalClinic\.planning\phases\01-settings-shell-clinic-profile\01B-SUMMARY.md

<interfaces>
<!-- Logo upload pattern — from RESEARCH.md (Pattern 5, verified from ClinicProfileTab.tsx) -->

State additions to ClinicProfilePage:
  const [isDragging, setIsDragging] = useState(false)
  // logoUrl is already in FormState from Plan 01B

FileReader handler for file input onChange:
  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500_000) {
      setErrors(p => ({ ...p, logoUrl: 'Logo must be under 500KB' }))
      return
    }
    const reader = new FileReader()
    reader.onload = ev => setForm(p => ({ ...p, logoUrl: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

Drop handler (for the drop zone div):
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 500_000) {
      setErrors(p => ({ ...p, logoUrl: 'Logo must be under 500KB' }))
      return
    }
    const reader = new FileReader()
    reader.onload = ev => setForm(p => ({ ...p, logoUrl: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

Drop zone JSX (the div that accepts drops):
  <div
    onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
    onDragLeave={() => setIsDragging(false)}
    onDrop={handleDrop}
    onClick={() => fileRef.current?.click()}
    className={`w-20 h-20 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors
      ${isDragging ? 'border-primary bg-surface-container-low' : 'border-outline-variant hover:border-primary'}`}
  >

Hidden file input (paired with the drop zone):
  <input
    ref={fileRef}
    type="file"
    accept="image/*"
    className="hidden"
    onChange={handleLogoChange}
  />
  // fileRef: const fileRef = useRef<HTMLInputElement>(null)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add logo upload zone to ClinicProfilePage</name>
  <files>src/frontend/src/views/settings/ClinicProfilePage.tsx</files>

  <read_first>
    - src/frontend/src/views/settings/ClinicProfilePage.tsx — read the full current file from Plan 01B before editing; identify where to insert the logo upload section (between form heading and the first input field)
    - src/frontend/src/views/admin/ClinicProfileTab.tsx — reference the existing logo preview + FileReader pattern
  </read_first>

  <action>
Edit `src/frontend/src/views/settings/ClinicProfilePage.tsx` to add logo upload.
Do NOT rewrite the file — add the logo section and two new state variables only.

Step 1 — Add imports at the top of the file (alongside existing React imports):
  import { useRef } from 'react'
  // useState is already imported; add useRef to the same import line

Step 2 — Add two new state variables inside the component, after existing useState calls:
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

Step 3 — Add the two handler functions (`handleLogoChange` and `handleDrop`) inside
the component, before the `validate` function. Use the exact implementations from
the `<interfaces>` block above — do not alter the logic.

Step 4 — Replace the read-only logoUrl text display (the placeholder from Plan 01B)
with the full logo upload section. Place it immediately after the `<h1>` heading
and before the first form field (`<div>` for clinic name):

  {/* ── Logo ────────────────────────────────────────────────────── */}
  <div className="flex flex-col gap-xs">
    <label className="text-body-sm font-medium text-on-surface-variant">Clinic Logo</label>
    <div className="flex items-center gap-md">
      {/* Preview */}
      <div className="w-20 h-20 rounded-xl border border-outline-variant overflow-hidden bg-surface-container-low flex items-center justify-center flex-shrink-0">
        {form.logoUrl ? (
          <img src={form.logoUrl} alt="Clinic logo preview" className="w-full h-full object-cover" />
        ) : (
          <MaterialIcon name="add_photo_alternate" size={32} className="text-on-surface-variant" />
        )}
      </div>
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`flex-1 min-h-[44px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors px-md py-sm gap-xs
          ${isDragging ? 'border-primary bg-surface-container-low' : 'border-outline-variant hover:border-primary'}`}
      >
        <MaterialIcon name="upload" size={20} className="text-on-surface-variant" />
        <span className="text-body-sm text-on-surface-variant text-center">
          Drag & drop or click to upload
        </span>
        <span className="text-label-md text-on-surface-variant">PNG, JPG — max 500KB</span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLogoChange}
      />
    </div>
    {errors.logoUrl && <p className="text-label-md text-error">{errors.logoUrl}</p>}
  </div>

Touch target audit while editing — scan every interactive element in the file and
confirm it has `min-h-[44px]` (and `min-w-[44px]` where applicable):
- All `<input>` elements: must have `min-h-[44px]`
- `<textarea>` for address: must have `min-h-[44px]`
- Save button: already has `min-h-[44px]` from Plan 01B
- Drop zone div: must have `min-h-[44px]` — the JSX above already includes it

Responsive layout (UX-03) — ensure the outer page wrapper uses responsive
constraints that prevent horizontal overflow at 768px:
- The existing `<div className="p-xl max-w-2xl">` already constrains width to 672px
  (max-w-2xl = 42rem). This fits within 768px. No change needed.
- Verify the logo flex row uses `flex-wrap` or is safe at small widths: the preview
  is `w-20` (80px) + `gap-md` (16px) + flex-1 drop zone. At 768px with sidebar
  collapsed (`ml-14` = 56px), available content width ≈ 712px − padding. The flex
  row fits. No change needed.
- If the form has any `min-w-*` or `w-*` fixed widths wider than 600px, remove them.

UX-01 note: logoUrl is NOT a masked secret field. It is an image URL or a data-URL.
Do not add masking logic. The masking note in REQUIREMENTS.md applies to tokens/keys
in later pages (Notifications, Integrations).
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>

  <acceptance_criteria>
    - `onDragOver`, `onDragLeave`, `onDrop` handlers present on the drop zone div
    - `handleLogoChange` function present with `file.size > 500_000` guard
    - `handleDrop` function present with `file.size > 500_000` guard
    - `fileRef` (`useRef<HTMLInputElement>`) present and wired to hidden `<input type="file">`
    - `isDragging` state drives conditional class: `border-primary bg-surface-container-low` vs `border-outline-variant`
    - When `form.logoUrl` is set, an `<img>` renders with `src={form.logoUrl}`
    - `errors.logoUrl` message "Logo must be under 500KB" renders when set
    - All `<input>` and `<textarea>` elements have `min-h-[44px]` class
    - No `min-w-*` or fixed `w-*` classes wider than the max-w-2xl container
    - No raw hex colors added
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>Logo upload zone renders with drag-and-drop + click-to-upload; 500KB guard shows inline error; preview updates immediately; all inputs have 44px touch targets; page fits 768px without horizontal scroll.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Plans 01A, 01B, and 01C implemented:
    - SettingsLayout with role-filtered sidebar at /settings
    - ClinicProfilePage wired to GET/PUT /api/v1/settings/clinic
    - Logo upload zone with drag-and-drop and 500KB guard
    All three Phase 1 success criteria should now be met.
  </what-built>

  <how-to-verify>
    Start the dev server: `cd src/frontend && npm run dev`

    1. SUCCESS CRITERION 1 — Navigability:
       - Log in as admin → navigate to /settings → confirm redirect to /settings/clinic-profile
       - Sidebar shows 6 items: Clinic Profile, Operating Hours, Notifications, Payment, Integrations, My Preferences
       - No blank page, no console errors (check browser DevTools → Console)
       - Resize to 768px width → sidebar collapses to icon-only strip automatically
       - Click toggle button → sidebar expands; click again → collapses

    2. SUCCESS CRITERION 2 — Data persistence:
       - Clinic Profile form loads with current clinic name pre-populated
       - Edit Clinic Name to "Anemal Test Clinic" → click Save Changes
       - Button shows "Saving…" briefly → "Changes saved successfully" banner appears
       - Hard-refresh (Ctrl+F5) → clinic name still shows "Anemal Test Clinic"
       - Try submitting with empty Clinic Name → inline error appears; no API call
       - Try entering "not-a-url" in Website → inline error appears

    3. SUCCESS CRITERION 3 — Touch targets + responsive:
       - Drag a PNG file under 500KB onto the logo zone → preview updates inline
       - Drag a file over 500KB → "Logo must be under 500KB" error appears
       - Click the drop zone → file picker opens
       - Resize to 768px → no horizontal scroll bar appears
       - Resize to 1024px → no horizontal scroll bar appears

    4. ROLE CHECKS:
       - Log in as doctor/staff role → navigate to /settings → sidebar shows only "My Preferences"
       - Log in as superadmin role → navigate to /settings → sidebar shows only "System Settings"
  </how-to-verify>

  <resume-signal>Type "approved" if all 4 checks pass, or describe any issues found.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| File drop zone → FileReader | User-supplied file bytes read into browser memory; rendered as img src |
| img src=data-URL → PUT /api/v1/settings/clinic | data-URL string sent as logoUrl field; backend stores as-is |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01C-01 | Denial of Service | Logo data-URL size | mitigate | `file.size > 500_000` guard in both `handleLogoChange` and `handleDrop`; error message shown; FileReader not called; Express body-parser limit is the backend backstop |
| T-01C-02 | Tampering | SVG logo with embedded script | accept | `<img src=data-URL>` renders image pixels only; browser does not execute scripts in img element; SVG-via-img is sandboxed by browser CSP |
| T-01C-03 | Information Disclosure | Logo data-URL stored in tenant_settings | accept | logoUrl is not a secret; stored plaintext (same as name, phone); not encrypted; risk is low (clinic logo is public-facing) |
</threat_model>

<verification>
See checkpoint:human-verify task above for full manual verification steps.

Automated:
- `cd src/frontend && npx tsc --noEmit` → 0 errors
- `cd src/frontend && npm run build` → build completes without errors (confirms Vite bundling is clean)
</verification>

<success_criteria>
- CLINIC-02: Logo drag-and-drop zone renders; file preview updates on drop/select; 500KB guard shows inline error
- UX-01: logoUrl is not a masked secret — no masking logic needed; this requirement is fully addressed at the API level (Phase 1.5-B already complete)
- UX-02: All interactive elements on ClinicProfilePage have `min-h-[44px]` — inputs, textarea, save button, drop zone
- UX-03: Page renders without horizontal scroll at 768px (sidebar collapsed) and 1024px (sidebar expanded or collapsed)
- `npx tsc --noEmit` exits 0
- `npm run build` exits 0
- Human checkpoint approved
</success_criteria>

<output>
Create `.planning/phases/01-settings-shell-clinic-profile/01C-SUMMARY.md` when done.
</output>
