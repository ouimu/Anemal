---
phase: session-d
plan: 01
type: summary
status: complete
completed: 2026-06-12
---

# Session D — Barcode Scanning (ZXing) — Summary

## Goal Achieved

Staff can tap "Scan" in the Inventory toolbar → camera modal opens → point at barcode → search fills automatically → modal closes. Camera LED turns off on close. Permission errors surface gracefully.

## Files Created / Modified

| File | Change |
|------|--------|
| `src/frontend/src/components/BarcodeScanner/useBarcodeScanner.ts` | New — ZXing lifecycle hook |
| `src/frontend/src/components/BarcodeScanner/BarcodeScanner.tsx` | New — modal component |
| `src/frontend/src/components/BarcodeScanner/index.ts` | New — barrel export |
| `src/frontend/src/views/clinic/ClinicInventory.tsx` | Modified — Scan button + scanning state + BarcodeScanner render |
| `src/frontend/vite.config.ts` | Modified — `optimizeDeps.include` for ZXing CJS interop |
| `docs/index.html` | Updated — Session D marked complete, Session E next |
| `docs/functional_spec_detailed.html` | Updated — FR-06-07 barcode scan implementation details |

## Packages Installed

- `@zxing/browser@0.2.0` (in `src/frontend`)
- `@zxing/library@0.22.0` (compatible peer — `@zxing/browser@0.2.0` requires `^0.22.0`)

Note: RESEARCH.md referenced `@zxing/library@0.23.0` but that version is outside the `^0.22.0` peer range. `0.22.0` is the correct compatible version.

## Key Implementation Decisions

- **`cancelled` StrictMode guard**: React 18 double-mounts effects; the `cancelled` flag prevents a resolved `decodeFromVideoDevice` promise from calling `onScan` after unmount.
- **Belt-and-suspenders cleanup**: `IScannerControls.stop()` + raw `MediaStream.getVideoTracks().forEach(t => t.stop())` ensures camera LED turns off reliably across browsers.
- **`NotFoundException` filter**: ZXing fires this on every frame with no barcode. Silently ignored; only real errors reach `setError`.
- **`onScan` excluded from effect deps**: Callers must wrap in `useCallback`. Adding it to deps causes re-subscription on every render when the parent doesn't memoize.
- **Input sanitisation**: `barcode.trim().slice(0, 100)` before `setSearch` — treats ZXing output as untrusted per RESEARCH.md threat model.
- **No backend changes**: Existing `GET /api/products?search=` endpoint used directly.

## Verification

- `npx tsc --noEmit` exits 0
- Playwright headless: Scan button visible (44px), modal opens, camera error surfaces in headless (expected), modal closes cleanly, re-open/close no state leak, search input functional after scanner
- Human checkpoint approved 2026-06-12
