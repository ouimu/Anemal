---
phase: session-d
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/vite.config.ts
  - src/frontend/src/components/BarcodeScanner/useBarcodeScanner.ts
  - src/frontend/src/components/BarcodeScanner/BarcodeScanner.tsx
  - src/frontend/src/components/BarcodeScanner/index.ts
  - src/frontend/src/views/clinic/ClinicInventory.tsx
  - docs/index.html
  - docs/functional_spec_detailed.html
autonomous: false
requirements:
  - SCAN-01
  - SCAN-02
  - SCAN-03
  - SCAN-04
  - SCAN-05

must_haves:
  truths:
    - "Staff taps a scan button in the inventory toolbar and a camera modal opens"
    - "Pointing the camera at a barcode closes the modal and fills the search input with the decoded value"
    - "Matching products appear in the inventory list after the search fills"
    - "Closing the modal without scanning stops the camera stream (LED off)"
    - "Devices without camera permission show an error message instead of crashing"
  artifacts:
    - path: "src/frontend/src/components/BarcodeScanner/useBarcodeScanner.ts"
      provides: "ZXing lifecycle hook — camera start, stop, StrictMode guard"
      exports: ["useBarcodeScanner"]
    - path: "src/frontend/src/components/BarcodeScanner/BarcodeScanner.tsx"
      provides: "Modal overlay with live video feed, loading, error, and close states"
      exports: ["default BarcodeScanner"]
    - path: "src/frontend/src/components/BarcodeScanner/index.ts"
      provides: "Barrel export"
    - path: "src/frontend/src/views/clinic/ClinicInventory.tsx"
      provides: "Scan button + scanning state + BarcodeScanner render"
      contains: "scanning"
  key_links:
    - from: "src/frontend/src/views/clinic/ClinicInventory.tsx"
      to: "src/frontend/src/components/BarcodeScanner/BarcodeScanner.tsx"
      via: "conditional render on scanning state"
      pattern: "scanning &&"
    - from: "src/frontend/src/components/BarcodeScanner/useBarcodeScanner.ts"
      to: "@zxing/browser BrowserMultiFormatReader"
      via: "decodeFromVideoDevice"
      pattern: "decodeFromVideoDevice"
    - from: "BarcodeScanner onScan callback"
      to: "ClinicInventory setSearch"
      via: "handleBarcodeScan prop"
      pattern: "setSearch"
---

<objective>
Implement camera barcode scanning in the inventory screen. Staff taps a scan button, a
full-screen camera modal opens, ZXing continuously decodes the video feed, and the first
successful decode auto-fills the inventory search state and closes the modal.

Purpose: Staff can scan physical product barcodes instead of typing — faster lookup at the
dispensary counter or stockroom.

Output: BarcodeScanner component + useBarcodeScanner hook + wiring into ClinicInventory +
vite.config.ts optimizeDeps patch + verified TypeScript compilation.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md

# Design system
@stitch_vet_clinic_design_system/compassionate_care_system/DESIGN.md

# Skills
@.claude/skills/anemal-coding-rules/SKILL.md
@.claude/skills/anemal-design-system/SKILL.md
</context>

<interfaces>
<!-- Key interfaces extracted from codebase for executor. No exploration needed. -->

From src/frontend/src/components/MaterialIcon.tsx:
```typescript
interface Props {
  name: string
  fill?: 0 | 1
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700
  size?: number
  className?: string
}
export default function MaterialIcon({ name, fill, weight, size, className }: Props)
```

From src/frontend/src/views/clinic/ClinicInventory.tsx (relevant excerpt):
```typescript
// State already present:
const [search, setSearch] = useState('')
// Search input is at line ~67 inside a toolbar div:
// <div className="flex flex-wrap items-center gap-sm mb-md">
//   <div className="relative flex-1 min-w-[220px]">  ← search wrapper
//   <select …>All categories</select>
// </div>
// Scan button goes AFTER the select, still inside the toolbar flex div.

// inputCls and labelCls constants are already defined at module scope.
```

From src/frontend/vite.config.ts:
```typescript
// Current config — add optimizeDeps.include for ZXing CJS interop:
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/auth': ..., '/api': ... } }
  // ADD: optimizeDeps: { include: ['@zxing/browser', '@zxing/library'] }
})
```

ZXing types used in the hook:
```typescript
import { BrowserMultiFormatReader, IScannerControls, NotFoundException } from '@zxing/browser'
// NotFoundException is re-exported from @zxing/library via @zxing/browser
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Install packages and patch vite.config.ts</name>
  <files>
    src/frontend/package.json,
    src/frontend/package-lock.json,
    src/frontend/vite.config.ts
  </files>
  <action>
    Step 1 — Install ZXing packages in the frontend directory:
    `cd src/frontend && npm install @zxing/browser@0.2.0 @zxing/library@0.23.0`

    Both packages are pre-approved in the RESEARCH.md Package Legitimacy Audit
    (`[OK]` verdict, slopcheck 2026-06-12). No legitimacy checkpoint needed.

    Step 2 — Add `optimizeDeps` to `vite.config.ts` to force Vite to pre-bundle both
    packages together, resolving the CJS interop at build time (prevents
    `[vite] Failed to resolve module specifier` warnings and dev-server re-runs):

    ```
    optimizeDeps: {
      include: ['@zxing/browser', '@zxing/library']
    }
    ```

    Insert this field into the `defineConfig({...})` object alongside `plugins` and
    `server`. Do not remove any existing fields.
  </action>
  <verify>
    <automated>
      cd D:/Development/AnimalClinic/src/frontend && node -e "require.resolve('@zxing/browser')" && node -e "require.resolve('@zxing/library')" && echo "packages OK"
    </automated>
  </verify>
  <done>
    `node_modules/@zxing/browser` and `node_modules/@zxing/library` both exist.
    `vite.config.ts` contains `optimizeDeps: { include: ['@zxing/browser', '@zxing/library'] }`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create BarcodeScanner component and useBarcodeScanner hook</name>
  <files>
    src/frontend/src/components/BarcodeScanner/useBarcodeScanner.ts,
    src/frontend/src/components/BarcodeScanner/BarcodeScanner.tsx,
    src/frontend/src/components/BarcodeScanner/index.ts
  </files>
  <action>
    Create the directory `src/frontend/src/components/BarcodeScanner/` with three files.

    --- FILE 1: useBarcodeScanner.ts ---

    Exports `useBarcodeScanner(onScan: (barcode: string) => void, active: boolean)`.
    Returns `{ videoRef: RefObject<HTMLVideoElement>, error: string | null, isReady: boolean }`.

    Implementation rules:
    - Import `BrowserMultiFormatReader`, `IScannerControls`, `NotFoundException` from
      `@zxing/browser`.
    - `videoRef` is `useRef<HTMLVideoElement>(null)`.
    - `controlsRef` is `useRef<IScannerControls | null>(null)` — NOT useState (avoids
      re-render on assignment).
    - `useEffect` depends on `[active]` only. When `active` is false the effect is a no-op.
    - Inside the effect, use a `let cancelled = false` closure flag to guard against React 18
      StrictMode double-mount: if the cleanup fires before `decodeFromVideoDevice` resolves,
      the resolved controls are stopped immediately via the flag check.
    - Camera start sequence:
      1. `new BrowserMultiFormatReader()` — created inside the effect, not at module level.
      2. `decodeFromVideoDevice(undefined, videoRef.current!, callback)` — passing `undefined`
         as deviceId makes ZXing use `facingMode: environment` (back camera) automatically,
         which works more reliably on iOS than specifying a deviceId.
      3. In the decode callback: if `result` is truthy, call `controls.stop()` then
         `onScan(result.getText())`. If `err` is truthy AND is NOT an instance of
         `NotFoundException`, call `setError(err.message)` — NotFoundException fires every
         frame with no code and must be silently ignored.
    - Error handling: catch DOMException by `e.name`:
      - `NotAllowedError` → "Camera permission denied. Please allow camera access and try again."
      - `NotFoundError` / `DevicesNotFoundError` → "No camera found on this device."
      - `NotReadableError` → "Camera is already in use by another app."
      - anything else → `"Camera error: " + e.message`
    - Cleanup: set `cancelled = true`, call `controlsRef.current?.stop()`, set
      `controlsRef.current = null`, then belt-and-suspenders stop all video tracks:
      `(videoRef.current?.srcObject as MediaStream)?.getVideoTracks().forEach(t => t.stop())`.
      Reset `isReady` and `error` to initial values.
    - `onScan` is called from inside the effect callback; it must be stable (caller wraps in
      `useCallback`). Do NOT add `onScan` to the effect dependency array — it causes
      re-subscription on every render if the parent does not memoize. Add a comment explaining
      this dependency omission.

    --- FILE 2: BarcodeScanner.tsx ---

    Props interface:
    ```typescript
    interface BarcodeScannerProps {
      onScan: (barcode: string) => void
      onClose: () => void
    }
    ```

    The component calls `useBarcodeScanner` with a stable `handleScan` callback
    (`useCallback([onScan, onClose])`). `handleScan` calls `onScan(barcode)` then
    `onClose()` — the hook already stops the camera before calling back, so no extra
    `controls.stop()` is needed here.

    UI structure (all Tailwind token names — zero raw hex values):
    - Backdrop: `fixed inset-0 z-50 flex items-center justify-center bg-black/60`
      with `role="dialog" aria-modal="true" aria-label="Barcode Scanner"`.
    - Card: `bg-surface rounded-2xl shadow-lvl3 w-full max-w-sm mx-md overflow-hidden`
    - Header row: `flex items-center justify-between px-lg py-md border-b border-outline-variant`
      - Left: `<MaterialIcon name="qr_code_scanner" size={20} className="text-secondary mr-sm" />`
        + `<span className="text-title-md font-headline font-bold text-on-surface">Scan Barcode</span>`
      - Right: close button `min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-surface-container-low` with `aria-label="Close scanner"` and `<MaterialIcon name="close" size={22} />`
    - Video wrapper: `relative bg-primary` with `aspect-video`
      - `<video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />`
        (`playsInline` is required on iOS Safari to prevent full-screen takeover)
      - Aim overlay (pointer-events-none, centered): a `w-48 h-48 border-2 border-secondary
        rounded-lg opacity-70` div
      - Loading overlay (shown when `!isReady && !error`): `absolute inset-0 flex items-center
        justify-center bg-black/50` with `<span className="text-body-md text-white">Starting camera…</span>`
    - Error section (shown when `error`): `px-lg py-md flex items-start gap-sm text-error`
      with `<MaterialIcon name="error_outline" size={18} />` and the error string in
      `text-body-sm`. Include a "Try again" button (`min-h-[44px]`, calls `onClose`) so the
      user can re-open and retry.
    - Footer: `px-lg py-md text-center text-body-sm text-on-surface-variant`
      with text "Point camera at a barcode — it will scan automatically".

    --- FILE 3: index.ts ---

    Single line: `export { default } from './BarcodeScanner'`
  </action>
  <verify>
    <automated>
      cd D:/Development/AnimalClinic/src/frontend && npx tsc --noEmit 2>&1 | head -30
    </automated>
  </verify>
  <done>
    Three files exist under `src/frontend/src/components/BarcodeScanner/`.
    `npx tsc --noEmit` exits 0 (no TypeScript errors).
    The hook contains the `cancelled` flag pattern and the belt-and-suspenders track stop.
    The video element has `autoPlay muted playsInline`.
    `NotFoundException` is imported and used to filter the decode callback error.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire BarcodeScanner into ClinicInventory</name>
  <files>
    src/frontend/src/views/clinic/ClinicInventory.tsx
  </files>
  <action>
    Edit `src/frontend/src/views/clinic/ClinicInventory.tsx`:

    1. Add `useCallback` to the existing React import (do NOT add a second `from 'react'` line):
       `import { useState, useCallback } from 'react'`
       Add a new import below existing imports:
       `import BarcodeScanner from '../../components/BarcodeScanner'`

    2. Add state inside the component (after the existing `stockingIn` state):
       `const [scanning, setScanning] = useState(false)`

    3. Add a stable scan handler (after state declarations):
       ```typescript
       const handleBarcodeScan = useCallback((barcode: string) => {
         setSearch(barcode.trim().slice(0, 100))
         setScanning(false)
       }, [])
       ```
       The `trim().slice(0, 100)` caps the barcode value before it reaches the search state
       (security: treats ZXing output as untrusted input per RESEARCH.md security domain).

    4. In the toolbar div (`flex flex-wrap items-center gap-sm mb-md`), add the scan button
       AFTER the `<select>` element:
       ```tsx
       <button
         onClick={() => setScanning(true)}
         className="flex items-center gap-sm bg-surface border border-outline-variant rounded-full px-lg min-h-[44px] text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
         aria-label="Open barcode scanner"
       >
         <MaterialIcon name="qr_code_scanner" size={18} />
         Scan
       </button>
       ```

    5. At the bottom of the component's return statement (just before the final closing `</div>`
       of the `p-lg` wrapper), add:
       ```tsx
       {scanning && (
         <BarcodeScanner
           onScan={handleBarcodeScan}
           onClose={() => setScanning(false)}
         />
       )}
       ```

    6. Verify TypeScript:
       `cd src/frontend && npx tsc --noEmit`
  </action>
  <verify>
    <automated>
      cd D:/Development/AnimalClinic/src/frontend && npx tsc --noEmit 2>&1 | head -30
    </automated>
  </verify>
  <done>
    `ClinicInventory.tsx` has `scanning` state, `handleBarcodeScan` useCallback, scan
    button with `min-h-[44px]`, and conditional `<BarcodeScanner>` render.
    `npx tsc --noEmit` exits 0.
    The search value is trimmed and capped to 100 chars before entering state.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Camera barcode scanner wired into the inventory screen. Scan button in toolbar opens a
    modal camera overlay; first successful decode fills the search input and closes modal;
    camera stream stops on close; permission errors surface a message.
  </what-built>
  <how-to-verify>
    1. Start the dev server: `cd src/frontend && npm run dev` (ensure backend is also running).
    2. Log in and navigate to Inventory (http://localhost:5173).
    3. Confirm the "Scan" button with `qr_code_scanner` icon appears in the toolbar, right of
       the category select. Button must be ≥ 44px tall — inspect if unsure.
    4. Click "Scan" → camera modal opens, "Starting camera…" appears briefly, then the live
       feed shows. Confirm camera LED turns on.
    5. Point at any barcode (product box, book, etc.) → search input fills with the barcode
       value → modal closes → inventory list filters.
    6. Open scanner again → click X (close) → modal closes → camera LED turns off.
    7. On a device/browser without camera (or deny permission when prompted) → error message
       "Camera permission denied…" appears inside the modal. No crash or blank screen.
    8. On a tablet or phone: confirm the back camera activates (not front), and the video is
       inline (not full-screen takeover on iOS Safari).
  </how-to-verify>
  <resume-signal>Type "approved" or describe any issues found.</resume-signal>
</task>

<task type="auto">
  <name>Task 5: Update docs</name>
  <files>
    docs/index.html,
    docs/functional_spec_detailed.html
  </files>
  <action>
    In `docs/index.html`:
    - In the Upcoming Work section, mark "Barcode scanning (ZXing)" as ✅ done.
    - Update the next-pointer to Session E (S3 Photo Upload) or Session G (LINE/SMS).
    - In the phase status table, note Session D complete.
    - In Roadmap History, append an entry for Session D:
      "Session D — Barcode scanning (ZXing): BarcodeScanner modal + useBarcodeScanner hook
      wired into ClinicInventory; no backend changes needed; camera stream cleanup via
      IScannerControls + MediaStream track stop."

    In `docs/functional_spec_detailed.html`:
    - Add or update the barcode scanning entry under the Inventory module:
      "Camera barcode scanning via @zxing/browser 0.2.0 + @zxing/library 0.23.0.
      BarcodeScanner modal component with useBarcodeScanner hook. Decodes on first valid
      frame, auto-fills GET /api/products?search= (existing endpoint, no backend change).
      Handles permission denied, no-camera, and camera-in-use errors. StrictMode-safe
      cleanup: IScannerControls.stop() + MediaStream getVideoTracks().forEach(t => t.stop()).
      iOS Safari: playsInline required."
  </action>
  <verify>
    <automated>grep -i "barcode" docs/index.html | head -5 &amp;&amp; grep -i "barcode" docs/functional_spec_detailed.html | head -5</automated>
  </verify>
  <done>
    `docs/index.html` Upcoming Work marks barcode scanning done and points to next session.
    `docs/functional_spec_detailed.html` documents the ZXing integration approach.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Camera → ZXing decoder | Raw camera frames processed by ZXing client-side |
| ZXing result → React state | `result.getText()` string treated as untrusted input before entering search state |
| Search state → API | `GET /api/products?search=` query param; backend uses Prisma `contains` (parameterized) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-SD-01 | Tampering | ZXing result.getText() → setSearch | mitigate | Trim and cap to 100 chars client-side in `handleBarcodeScan` before setting state; Prisma `contains` on backend is parameterized (no raw SQL injection risk) |
| T-SD-02 | Denial of Service | Camera stream leak | mitigate | Belt-and-suspenders cleanup: `IScannerControls.stop()` + `getVideoTracks().forEach(t => t.stop())` + StrictMode `cancelled` flag guard |
| T-SD-03 | Information Disclosure | Camera permission error messages | accept | Error messages only expose device-level info (no-camera, permission denied) — already surfaced by the browser natively; no PII leak |
| T-SD-SC | Tampering | npm install @zxing/browser @zxing/library | mitigate | Both packages in Package Legitimacy Audit with `[OK]` verdict; slopcheck ran 2026-06-12; no [ASSUMED]/[SUS] packages — no blocking checkpoint required |
</threat_model>

<verification>
After all tasks complete:

1. `cd src/frontend && npx tsc --noEmit` — exits 0
2. `node_modules/@zxing/browser/index.js` exists
3. `src/frontend/src/components/BarcodeScanner/BarcodeScanner.tsx` contains `playsInline`
4. `src/frontend/src/components/BarcodeScanner/useBarcodeScanner.ts` contains `cancelled`
5. `src/frontend/src/views/clinic/ClinicInventory.tsx` contains `scanning` and `BarcodeScanner`
6. `docs/index.html` marks barcode scanning complete
7. Human checkpoint approved in Task 4
</verification>

<success_criteria>
1. Staff taps "Scan" in inventory toolbar → camera modal opens with live video feed
2. Pointing at a barcode → modal closes, search input fills with barcode value, matching products appear
3. Camera LED turns off when modal is closed (both IScannerControls.stop and raw track stop)
4. Permission denied → error message rendered in modal, no crash
5. `npx tsc --noEmit` exits 0
6. No raw hex colors anywhere in new files; all interactive elements ≥ 44×44px
</success_criteria>

<output>
Create `.planning/phases/session-d-barcode-scanning/session-d-01-SUMMARY.md` when done.
</output>
