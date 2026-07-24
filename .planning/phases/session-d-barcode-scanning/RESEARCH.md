# Session D: Barcode Scanning — Research

**Researched:** 2026-06-12
**Domain:** Browser barcode scanning — ZXing JS ecosystem in React 18 + TypeScript + Vite
**Confidence:** HIGH (stack + API); MEDIUM (iOS Safari behaviour); LOW (react-zxing v3 internals until README confirmed)

---

## Summary

The ZXing JS ecosystem has two usage paths for React: the **low-level `@zxing/browser` + `@zxing/library` pair** and the **high-level `react-zxing` wrapper hook**. As of June 2026, `react-zxing` v3.0.0 (released 2026-06-01) has dropped `@zxing/library` as its dependency and now wraps the `barcode-detector` polyfill (Sec-ant/barcode-detector, ZXing-C++ WASM under the hood). This is a significant architecture shift that should be evaluated before adopting v3 without reading its changelog.

For a POS barcode scanner use case in this project, the **recommended path is `@zxing/browser@0.2.0` + `@zxing/library@0.23.0`** with a custom `useBarcodeScanner` hook. This gives full API control, well-understood TypeScript types, no surprise v3 breaking changes, and clean React lifecycle integration. The component is rendered as a modal overlay that auto-closes on a valid decode, with an Escape/cancel button as fallback.

`react-zxing` v2.x is a viable simpler alternative if hook abstraction is preferred over control. v3 is NOT recommended yet — the `barcode-detector` WASM path is largely unvalidated in Vite + iOS Safari environments.

**Primary recommendation:** Use `@zxing/browser@0.2.0` + `@zxing/library@0.23.0` directly. Build a `useBarcodeScanner` hook with `BrowserMultiFormatReader`, store controls in a `useRef<IScannerControls>`, clean up in `useEffect` return, and surface as a modal over the ClinicInventory search bar.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Camera stream access | Browser / Client | — | MediaDevices.getUserMedia is a browser API |
| Barcode decode | Browser / Client | — | ZXing runs entirely client-side, no backend |
| Search state update | Browser / Client | — | Sets existing `search` state in ClinicInventory |
| Product lookup | API / Backend | — | Existing `GET /api/products?search=` unchanged |
| Permission error UI | Browser / Client | — | Navigator API error surfaced in component |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@zxing/browser` | 0.2.0 | Browser layer: video device access, continuous decode | Official ZXing JS browser package; last release April 2026 [VERIFIED: npm registry] |
| `@zxing/library` | 0.23.0 | Decode engine: multi-format 1D/2D barcode recognition | Core ZXing TypeScript port; peer dependency of `@zxing/browser` [VERIFIED: npm registry] |

### Supporting (optional)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-zxing` | 2.1.0 (NOT 3.0.0) | Pre-built `useZxing` hook | If you want less boilerplate and accept less control; pin to v2.x until v3 internals are verified |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@zxing/browser` | `html5-qrcode@2.3.8` | html5-qrcode has a nicer out-of-box UI but is harder to integrate into existing search state; styles conflict with Tailwind; less TypeScript-friendly |
| `@zxing/browser` | `react-zxing@3.0.0` | v3 uses `barcode-detector` (ZXing-C++ WASM polyfill) — untested in this Vite/iOS Safari stack, released 2026-06-01, no migration docs found [ASSUMED] |
| Modal camera overlay | Physical USB scanner (HID keyboard emulation) | For a fixed reception desk, a USB scanner is simpler and needs zero camera code; for mobile/tablet, camera is required |

**Installation:**
```bash
npm install @zxing/browser @zxing/library
```

**Version verification:** Confirmed against npm registry 2026-06-12.
- `@zxing/browser@0.2.0` — published 2026-04-27 [VERIFIED: npm registry]
- `@zxing/library@0.23.0` — required as peer dep [VERIFIED: npm registry]

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@zxing/browser` | npm | ~6 yrs (2020-10) | —  | github.com/zxing-js/browser | [OK] | Approved |
| `@zxing/library` | npm | ~6 yrs (2018) | — | github.com/zxing-js/library | [OK] | Approved |
| `react-zxing` | npm | ~4 yrs (2022-08) | — | github.com/adamalfredsson/react-zxing | [OK] | Approved (pin v2.x) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

slopcheck ran successfully on 2026-06-12 and returned `[OK]` for all three packages.

---

## Architecture Patterns

### System Architecture Diagram

```
User taps "Scan Barcode" button
        │
        ▼
BarcodeScannerModal (modal overlay)
        │
        ├─── useEffect: new BrowserMultiFormatReader()
        │                       │
        │    BrowserMultiFormatReader.listVideoInputDevices()
        │                       │
        │    select back camera (facingMode: environment fallback)
        │                       │
        │    decodeFromVideoDevice(deviceId, videoRef, callback)
        │                       │  (returns Promise<IScannerControls>)
        │    store controls in controlsRef
        │
        ├─── <video ref={videoRef} autoPlay muted playsInline />
        │    (live camera feed rendered inside modal)
        │
        ├─── callback fires on each decode
        │         │
        │         └─── result.getText() → barcode string
        │                   │
        │                   ├─── controls.stop()     (stop camera)
        │                   └─── onScan(barcode)      ──► setSearch(barcode)
        │                                                  in ClinicInventory
        │
        └─── on unmount / cancel:
                  controlsRef.current?.stop()
                  videoRef.current?.srcObject tracks stop()


ClinicInventory (search state updated)
        │
        └─── useProducts({ search: barcode }) ──► GET /api/products?search=<barcode>
```

### Recommended Project Structure

```
src/frontend/src/
├── components/
│   └── BarcodeScanner/
│       ├── BarcodeScanner.tsx        # Modal shell + video element
│       ├── useBarcodeScanner.ts      # ZXing lifecycle hook
│       └── index.ts                  # barrel export
├── views/clinic/
│   └── ClinicInventory.tsx           # adds scan button + state wiring
```

### Pattern 1: `useBarcodeScanner` Hook

**What:** Encapsulates `BrowserMultiFormatReader` lifecycle, device enumeration, error handling, and cleanup.

**When to use:** Any component that needs continuous camera barcode scan → trigger single callback on success.

```typescript
// Source: @zxing/browser docs + community patterns — adapted for React 18 [ASSUMED: StrictMode guard approach]
import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'

interface UseBarcodeScanner {
  videoRef: React.RefObject<HTMLVideoElement>
  error: string | null
  isReady: boolean
}

export function useBarcodeScanner(
  onScan: (barcode: string) => void,
  active: boolean
): UseBarcodeScanner {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!active || !videoRef.current) return

    let cancelled = false // StrictMode double-mount guard

    const reader = new BrowserMultiFormatReader()

    async function start() {
      try {
        // Enumerate devices — back camera preferred
        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        const backCamera = devices.find((d) =>
          /back|rear|environment/i.test(d.label)
        )
        const deviceId = backCamera?.deviceId ?? undefined
        // undefined → ZXing uses facingMode: environment automatically

        if (cancelled) return

        const controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result, err) => {
            if (result) {
              controls.stop()
              onScan(result.getText())
            }
            // NotFoundException fires every frame when no code — safe to ignore
          }
        )

        if (cancelled) {
          controls.stop()
          return
        }

        controlsRef.current = controls
        setIsReady(true)
      } catch (e: unknown) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('Permission denied') || msg.includes('NotAllowedError')) {
          setError('Camera permission denied. Please allow camera access and try again.')
        } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
          setError('No camera found on this device.')
        } else {
          setError(`Camera error: ${msg}`)
        }
      }
    }

    start()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
      // Belt-and-suspenders: also stop all video tracks directly
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getVideoTracks().forEach((t) => t.stop())
      }
      setIsReady(false)
      setError(null)
    }
  }, [active]) // re-run when modal opens/closes; onScan is stable via useCallback in parent

  return { videoRef, error, isReady }
}
```

### Pattern 2: `BarcodeScanner` Modal Component

**What:** Full-screen/overlay modal that renders the video feed and exposes close/cancel.

```typescript
// Source: project pattern — Tailwind Compassionate Care System tokens [ASSUMED]
import { useCallback } from 'react'
import MaterialIcon from '../MaterialIcon'
import { useBarcodeScanner } from './useBarcodeScanner'

interface Props {
  onScan: (barcode: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const handleScan = useCallback(
    (barcode: string) => {
      onScan(barcode)
      onClose()
    },
    [onScan, onClose]
  )

  const { videoRef, error, isReady } = useBarcodeScanner(handleScan, true)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-primary/80"
      role="dialog"
      aria-modal="true"
      aria-label="Barcode Scanner"
    >
      <div className="relative w-full max-w-sm bg-surface rounded-2xl overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant">
          <span className="text-title-md font-headline font-bold text-on-surface">
            Scan Barcode
          </span>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-surface-container-low"
            aria-label="Close scanner"
          >
            <MaterialIcon name="close" size={24} />
          </button>
        </div>

        {/* Video feed */}
        <div className="relative aspect-square bg-primary">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline   // required on iOS Safari — without this, fullscreen takeover
          />
          {/* Aim overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-4 border-secondary rounded-lg opacity-80" />
          </div>
          {!isReady && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/60">
              <span className="text-body-md text-primary-on">Starting camera…</span>
            </div>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="px-lg py-md flex items-start gap-sm text-error">
            <MaterialIcon name="error_outline" size={20} />
            <span className="text-body-sm">{error}</span>
          </div>
        )}

        {/* Footer hint */}
        <div className="px-lg py-md text-center text-body-sm text-on-surface-variant">
          Point camera at a barcode — it will scan automatically
        </div>
      </div>
    </div>
  )
}
```

### Pattern 3: ClinicInventory Integration

Add to `ClinicInventory.tsx`:

```typescript
// Add state
const [scanning, setScanning] = useState(false)

// Add scan handler
const handleBarcodeScan = useCallback((barcode: string) => {
  setSearch(barcode)
  setScanning(false)
}, [])

// Add button next to search input (in toolbar)
<button
  onClick={() => setScanning(true)}
  className="flex items-center gap-sm bg-surface border border-outline-variant rounded-full px-lg min-h-[44px] text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
  aria-label="Open barcode scanner"
>
  <MaterialIcon name="barcode_scanner" size={18} />
  Scan
</button>

// Render modal at bottom of component
{scanning && (
  <BarcodeScanner
    onScan={handleBarcodeScan}
    onClose={() => setScanning(false)}
  />
)}
```

### Anti-Patterns to Avoid

- **Creating `BrowserMultiFormatReader` inside render:** Always instantiate inside `useEffect`, never at module or render level — it causes multiple camera streams.
- **Not calling `controls.stop()` on unmount:** The camera LED stays on permanently. The cleanup MUST stop both the controls object AND the raw MediaStream tracks (belt-and-suspenders).
- **Calling `controls.stop()` before await resolves:** Store controls in a ref, not state. If the component unmounts before the async `decodeFromVideoDevice` resolves, use the `cancelled` flag guard to stop immediately on resolve.
- **Missing `playsInline` on iOS:** Without this attribute, Safari takes over the video element and opens it full-screen, breaking the overlay layout.
- **Consuming `NotFoundException` as a real error:** ZXing fires the error callback with `NotFoundException` on every frame where no barcode is found. This is expected behavior — only log/surface other error types.
- **Calling `listVideoInputDevices` without prior permission:** On some browsers, `enumerateDevices()` returns blank labels until `getUserMedia` has been granted once. Start the stream first (via `decodeFromVideoDevice` with `deviceId: undefined`), then enumerate for camera switching UI.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Barcode decode algorithm | Custom image/canvas decoding | `@zxing/library` | ZXing handles 20+ 1D/2D formats, sub-pixel accuracy, orientation correction |
| Camera device enumeration | `navigator.mediaDevices.enumerateDevices()` wrapper | `BrowserMultiFormatReader.listVideoInputDevices()` | ZXing wrapper handles permission pre-check and filters to video-only |
| Stream cleanup | Manual `srcObject = null` | `controls.stop()` + track `.stop()` | IScannerControls handles internal timer/RAF loop cancellation |
| iOS back camera selection | Custom `facingMode` constraint | Pass `deviceId: undefined` to `decodeFromVideoDevice` | ZXing defaults to `facingMode: environment` when no deviceId — simpler and correct |

**Key insight:** The hard part of barcode scanning is not reading pixels — it is reliably starting and stopping the camera without leaks. `BrowserMultiFormatReader` + `IScannerControls` is the proven solution for this lifecycle.

---

## Common Pitfalls

### Pitfall 1: Camera LED stays on after modal close
**What goes wrong:** Camera stream continues running after the BarcodeScanner component unmounts.
**Why it happens:** `controls.stop()` stops the ZXing polling loop but may not fully release the MediaStream if it was set externally. Additionally, if the component unmounts before `decodeFromVideoDevice` resolves, `controlsRef.current` is still `null`.
**How to avoid:** Use the `cancelled` flag pattern in `useEffect`. In the cleanup function: (1) set `cancelled = true`, (2) call `controlsRef.current?.stop()`, (3) also call `videoRef.current.srcObject?.getVideoTracks().forEach(t => t.stop())` as belt-and-suspenders.
**Warning signs:** Camera LED remains on after closing modal; browser tab shows camera icon in the address bar.

### Pitfall 2: React 18 StrictMode double-mount race condition
**What goes wrong:** In development with `<StrictMode>`, `useEffect` fires twice (mount → unmount → remount). The first stream may not be stopped before the second starts, causing two active camera streams.
**Why it happens:** React 18 intentionally mounts, unmounts, and remounts components in development to surface cleanup bugs.
**How to avoid:** The `cancelled` boolean flag in the `useEffect` closure is the correct solution. When the cleanup fires from the first mount, it sets `cancelled = true`. When `decodeFromVideoDevice` resolves in the first mount's async chain, it checks `cancelled` and calls `controls.stop()` immediately. [VERIFIED: React StrictMode docs pattern]
**Warning signs:** Two camera permission prompts in sequence; `ERR_DEVICE_IN_USE` in the console.

### Pitfall 3: `NotFoundException` floods the console
**What goes wrong:** The browser console is overwhelmed with ZXing error messages on every video frame.
**Why it happens:** `decodeFromVideoDevice` fires the callback with an `err` argument every frame where no barcode is detected. This is `NotFoundException` from `@zxing/library` — not a real error.
**How to avoid:** In the callback, only process `result` — ignore `err` entirely, or explicitly filter: `if (err && !(err instanceof NotFoundException)) { setError(err.message) }`.
**Warning signs:** Console spam of "NotFoundException: No MultiFormat Readers were able to detect the code."

### Pitfall 4: iOS Safari camera opens full screen
**What goes wrong:** On iOS Safari, the `<video>` element triggers a full-screen native player, breaking the modal overlay.
**Why it happens:** iOS requires `playsInline` attribute on video elements for inline (non-fullscreen) playback.
**How to avoid:** Always add `playsInline` and `muted` to the `<video>` element. `autoPlay` also requires `muted` on iOS for autoplay policy reasons. [CITED: developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement]
**Warning signs:** Modal disappears and video plays fullscreen on iPhone/iPad.

### Pitfall 5: Blank camera labels before permission grant
**What goes wrong:** `listVideoInputDevices()` returns devices with empty label strings, so back-camera selection logic finds nothing.
**Why it happens:** `navigator.mediaDevices.enumerateDevices()` returns empty labels until the user has granted camera permission in this session.
**How to avoid:** For back-camera auto-selection, first call `decodeFromVideoDevice(undefined, ...)` — the `undefined` deviceId makes ZXing use `facingMode: environment` constraint directly. Only enumerate devices for a multi-camera-switching UI (after permission is already granted). [CITED: github.com/zxing-js/library/issues/149]
**Warning signs:** Back camera never selected even on devices with front/back cameras.

### Pitfall 6: Vite `optimizeDeps` warning for `@zxing/library`
**What goes wrong:** Vite's dev server emits CJS interop warnings for `@zxing/library` because it ships CJS modules.
**Why it happens:** `@zxing/library` is a CommonJS package; Vite pre-bundles it with esbuild which can warn about some internal dynamic requires.
**How to avoid:** Add to `vite.config.ts`:
```typescript
optimizeDeps: {
  include: ['@zxing/browser', '@zxing/library']
}
```
This forces Vite to pre-bundle both packages together, resolving interop at build time. [ASSUMED — no confirmed Vite issue ticket found, but standard pattern for CJS packages in Vite]
**Warning signs:** `[vite] Failed to resolve module specifier` or excessive `optimizeDeps` re-runs during dev.

---

## Code Examples

### Camera permission error handling
```typescript
// Source: MDN MediaDevices.getUserMedia() error types [CITED: developer.mozilla.org]
try {
  const controls = await reader.decodeFromVideoDevice(deviceId, video, cb)
} catch (e: unknown) {
  const name = (e as DOMException)?.name ?? ''
  if (name === 'NotAllowedError')  setError('Camera permission denied.')
  else if (name === 'NotFoundError') setError('No camera found on this device.')
  else if (name === 'NotReadableError') setError('Camera is already in use by another app.')
  else setError('Could not start camera.')
}
```

### Device enumeration (after permission granted)
```typescript
// Source: @zxing/browser README [CITED: github.com/zxing-js/browser]
const devices = await BrowserMultiFormatReader.listVideoInputDevices()
// Returns MediaDeviceInfo[] filtered to videoinput devices only
// Labels are populated only after getUserMedia() has been called once
```

### One-shot decode (for trigger-on-demand pattern)
```typescript
// Source: @zxing/browser issues/41 [CITED: github.com/zxing-js/browser/issues/41]
// decodeOnceFromVideoDevice = starts stream, decodes first code, stops
const reader = new BrowserMultiFormatReader()
const result = await reader.decodeOnceFromVideoDevice(undefined, videoElement)
console.log(result.getText())
// Stream auto-stops after first decode — no controls.stop() needed
// Note: less control over error handling than decodeFromVideoDevice
```

---

## One-shot vs Continuous: UX Decision

**Recommendation for this project: continuous decode + auto-close on first valid scan.**

| Approach | Behaviour | Best For |
|----------|-----------|----------|
| Continuous (`decodeFromVideoDevice`) | Keeps camera open; fires callback on every decode | POS / inventory scan where user scans multiple items |
| One-shot (`decodeOnceFromVideoDevice`) | Opens camera, decodes first barcode, auto-stops | QR login, one-time lookup |

For ClinicInventory, use **continuous** because:
- Pharmacist may scan multiple products in sequence
- The modal calls `controls.stop()` then `onClose()` after each scan — so it is effectively "one at a time" but the user can re-open
- Auto-close on first scan provides the right feedback loop for a search bar fill pattern

---

## Mobile / iOS Safari Notes

| Platform | Status | Notes |
|----------|--------|-------|
| Android Chrome | Full support | `facingMode: environment` reliably selects back camera |
| iOS Safari 16+ | Mostly works | Requires `playsInline` + `muted`; camera permission re-prompted intermittently on some iPadOS 18 builds |
| iOS Safari < 16 | Limited | `getUserMedia` has inconsistencies; back camera selection unreliable via `deviceId`; use `facingMode: environment` constraint only [CITED: github.com/zxing-js/library/issues/149] |
| Chrome on iOS | Same as Safari | Chrome on iOS uses WebKit engine; same restrictions apply |

**Workaround for iOS back camera:** Pass `deviceId: undefined` to `decodeFromVideoDevice`. ZXing then passes `{ video: { facingMode: { ideal: 'environment' } } }` to `getUserMedia`, which works more reliably than specifying a deviceId on iOS. [CITED: github.com/zxing-js/browser]

---

## Test Strategy

ZXing cannot be tested against a real camera in unit/integration tests. Use module mocking.

### Mock approach (Vitest)

```typescript
// tests/components/BarcodeScanner.test.tsx
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock the entire @zxing/browser module
vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
    decodeFromVideoDevice: vi.fn().mockResolvedValue({
      stop: vi.fn(),
    }),
  })),
}))

// Mock static method separately
import * as ZXing from '@zxing/browser'
vi.spyOn(ZXing.BrowserMultiFormatReader, 'listVideoInputDevices').mockResolvedValue([
  { deviceId: 'back-cam-id', label: 'Back Camera', kind: 'videoinput' } as MediaDeviceInfo,
])
```

### Test cases to cover

| Test | Type | What to assert |
|------|------|----------------|
| Modal opens on "Scan" button click | unit | BarcodeScanner renders, video element present |
| `onScan` called with decoded barcode string | unit | Mock `decodeFromVideoDevice` fires callback with mock Result; verify `onScan` called |
| Modal closes and `search` state updated on scan | integration | ClinicInventory + BarcodeScanner: scan fires → search input shows barcode |
| Camera cleanup on unmount | unit | After unmount, `controls.stop()` called; track `.stop()` called on MediaStream mock |
| Permission denied shows error UI | unit | Mock `decodeFromVideoDevice` rejects with NotAllowedError DOMException; verify error text rendered |
| Cancel button closes modal without scan | unit | Click close → `onClose` called; `controls.stop()` called |

### MediaStream mock (jsdom)

jsdom does not implement `navigator.mediaDevices`. Add to `vitest.setup.ts`:
```typescript
Object.defineProperty(window.navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getVideoTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]),
    }),
    enumerateDevices: vi.fn().mockResolvedValue([]),
  },
  writable: true,
})
```
Since `@zxing/browser` is mocked at module level, this jsdom stub is a safety net, not the primary mechanism.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@zxing/browser` | BarcodeScanner component | Not yet installed | — | Install via npm |
| `@zxing/library` | `@zxing/browser` peer dep | Not yet installed | — | Install together |
| Browser camera (MediaDevices) | useBarcodeScanner hook | Available on modern browsers | — | Show "no camera" error message |
| HTTPS or localhost | getUserMedia security requirement | ✓ (dev is localhost) | — | Production must be HTTPS |

**Missing dependencies with no fallback:**
- HTTPS required in production for `getUserMedia` — ensure deployment is on HTTPS (standard for any web app)

**Missing dependencies with fallback:**
- `@zxing/browser` / `@zxing/library` — not installed; install command is `npm install @zxing/browser @zxing/library` in `src/frontend/`

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (assumed from Vite project; no test config detected) [ASSUMED] |
| Config file | `vitest.config.ts` — Wave 0 gap |
| Quick run command | `npx vitest run src/components/BarcodeScanner` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| SCAN-01 | Scan button opens camera modal | unit | `npx vitest run BarcodeScanner.test` |
| SCAN-02 | Valid barcode fills search input | integration | `npx vitest run ClinicInventory.test` |
| SCAN-03 | Camera stream stops on close/scan | unit | `npx vitest run BarcodeScanner.test` |
| SCAN-04 | Permission denied shows error | unit | `npx vitest run BarcodeScanner.test` |
| SCAN-05 | playsInline present on video element | unit | DOM attribute assertion |

### Wave 0 Gaps

- [ ] `src/frontend/src/components/BarcodeScanner/BarcodeScanner.test.tsx` — covers SCAN-01 to SCAN-05
- [ ] `src/frontend/vitest.config.ts` — if not present, add with jsdom environment
- [ ] `src/frontend/vitest.setup.ts` — MediaDevices mock

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Camera access scoped to authenticated users (existing auth middleware handles) |
| V5 Input Validation | Yes | Barcode string from ZXing must be treated as untrusted user input — pass through existing search sanitisation; do NOT eval or execute |
| V6 Cryptography | No | No cryptographic operations |

**Threat pattern:** The decoded barcode string is injected into the `search` query parameter. The existing `GET /api/products?search=` backend uses Prisma `contains` — parameterized, not raw SQL — so SQL injection is mitigated. The barcode string should still be trimmed and length-capped client-side before setting state (max 50 chars is safe for any standard barcode format). [ASSUMED — verify Prisma query in products repository]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@zxing/library` BrowserCodeReader directly | `@zxing/browser` as dedicated browser layer | 2020 | Cleaner separation; browser-specific API in separate package |
| `react-zxing` v2 wrapping `@zxing/library` | `react-zxing` v3 wrapping `barcode-detector` WASM polyfill | 2026-06-01 | Potentially better performance via WASM; but breaking change — do not use v3 yet without validation |
| Manual `getUserMedia` + canvas decode | `decodeFromVideoDevice` with `IScannerControls` | 2020 | Lifecycle management abstracted; proper cleanup API |

**Deprecated / outdated:**
- `BrowserQRCodeReader`: QR-only; use `BrowserMultiFormatReader` for multi-format (EAN-13, Code-128, QR, etc.)
- Direct `BrowserCodeReader` from `@zxing/library` (not `@zxing/browser`): the browser-layer split moved these to `@zxing/browser`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `react-zxing` v3 switched to `barcode-detector` WASM and has breaking API changes vs v2 | Standard Stack | If API is compatible, could use v3 with smaller bundle; risk is low — pin to v2 is conservative safe choice |
| A2 | `vite.config.ts` needs `optimizeDeps.include` for `@zxing/library` CJS interop | Pitfall 6 | If not needed, the config addition is harmless no-op |
| A3 | Vitest is the test framework (no test config found in frontend) | Validation Architecture | If Jest is configured instead, mock syntax differs (`jest.mock` vs `vi.mock`) |
| A4 | Barcode string from `result.getText()` is safe to pass to existing Prisma `contains` search | Security Domain | If backend uses raw SQL in products search, SQL injection risk; verify `products.repository.ts` |
| A5 | `BrowserMultiFormatReader` defaults to `facingMode: environment` when `deviceId` is `undefined` | Hook pattern | If it defaults to front camera, user will need to flip — UX degradation on mobile |

---

## Open Questions (RESOLVED)

1. **react-zxing v3 API surface** — RESOLVED ✅
   - RESOLVED: Not adopting v3 this session — using `@zxing/browser@0.2.0` + `@zxing/library@0.23.0` directly. Evaluate v3 in a future spike when its WASM/iOS story stabilises.

2. **Physical USB scanner support** — RESOLVED ✅
   - RESOLVED: USB HID scanners type into the focused input field directly — zero code change needed. The existing search input already handles it. Camera approach built in this session covers tablet use case.

3. **Vitest setup in frontend** — RESOLVED ✅
   - RESOLVED: No frontend test framework exists and scope explicitly excludes frontend tests. No Vitest task in this plan. Manual visual verification at Task 4 checkpoint covers coverage.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: npm registry] `@zxing/browser@0.2.0` — confirmed 2026-06-12; github.com/zxing-js/browser
- [VERIFIED: npm registry] `@zxing/library@0.23.0` — confirmed 2026-06-12; github.com/zxing-js/library
- [VERIFIED: npm registry] `react-zxing@3.0.0` — confirmed 2026-06-12; dependency switch to `barcode-detector` confirmed via `npm view`
- [CITED: github.com/zxing-js/browser/issues/19] — correct stop pattern: `controls.stop()` + `getVideoTracks().forEach(t => t.stop())`
- [CITED: github.com/zxing-js/browser/issues/41] — `decodeOnceFromVideoDevice` vs `decodeFromVideoDevice` difference
- [CITED: github.com/zxing-js/library/issues/149] — iOS back camera selection via `facingMode: environment`
- [CITED: developer.mozilla.org] — `playsInline` requirement for iOS video autoplay
- [CITED: react.dev/reference/react/StrictMode] — double-mount pattern and cleanup requirement

### Secondary (MEDIUM confidence)
- [WebSearch verified] `BrowserMultiFormatReader` defaults `facingMode: environment` when `deviceId` is undefined — from multiple community sources
- [WebSearch] `NotFoundException` fires per-frame when no barcode detected — confirmed from multiple ZXing users
- [WebSearch] Vite `optimizeDeps.include` for CJS packages — standard Vite pattern

### Tertiary (LOW confidence)
- iOS camera permission re-prompt behaviour on iPadOS 18.4 — single Apple Community thread, unverified
- react-zxing v3 internal WASM approach — inferred from dependency change; no release notes found

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified against npm registry, slopcheck passed
- Architecture: HIGH — patterns derived from official ZXing issues + MDN
- iOS Safari: MEDIUM — known issues documented but some behaviours version-specific
- react-zxing v3: LOW — released 2026-06-01; minimal documentation found

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (stable ecosystem; `react-zxing` v3 behaviour may clarify sooner)
