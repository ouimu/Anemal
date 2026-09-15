import { useCallback } from 'react'
import Dialog from '../Dialog'
import MaterialIcon from '../MaterialIcon'
import { useBarcodeScanner } from './useBarcodeScanner'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
}

/**
 * Barcode scanner overlay (MODAL-11) — renders through the shared `Dialog`
 * shell under the default `dismissal='dismissible'` policy.
 *
 * `ClinicInventory.tsx`, this component's sole mount point, conditionally
 * mounts/unmounts it (`{scanning && <BarcodeScanner .../>}`) rather than
 * toggling an `open` prop, so `Dialog` is always rendered `open` here: every
 * dismissal channel (close button, backdrop, Escape) only ever calls
 * `onClose`, and it is the parent unmounting this component in response that
 * tears down the camera. `useBarcodeScanner`'s effect cleanup — which stops
 * the zxing `IScannerControls` and, belt-and-suspenders, every raw
 * `MediaStream` video track — therefore runs on React unmount regardless of
 * which channel triggered it, so no path can orphan the camera stream.
 *
 * The video viewfinder needs to bleed edge-to-edge against the panel, unlike
 * every other Dialog consumer's padded body content: `-m-md` exactly cancels
 * the body's `p-md` (16px) padding token for that one child only, so the
 * panel's own padding contract (`p-md flex-1 overflow-y-auto`) stays
 * untouched and every other consumer is unaffected.
 */
export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const handleScan = useCallback(
    (barcode: string) => {
      onScan(barcode)
      onClose()
    },
    [onScan, onClose]
  )

  const { videoRef, error, isReady } = useBarcodeScanner(handleScan, true)

  return (
    <Dialog title="Scan Barcode" open onClose={onClose} width="max-w-sm">
      {/* Video — bled edge-to-edge against the panel, see file JSDoc. */}
      <div className="-m-md">
        <div className="relative bg-primary aspect-video">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          {/* Aim overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-secondary rounded-lg opacity-70" />
          </div>
          {/* Loading overlay */}
          {!isReady && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <span className="text-body-md text-white">Starting camera…</span>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="pt-md flex items-start gap-sm text-error">
          <MaterialIcon name="error_outline" size={18} />
          <div className="flex-1">
            <p className="text-body-sm">{error}</p>
            <button
              onClick={onClose}
              className="mt-sm min-h-[44px] text-body-sm text-secondary underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Hint */}
      <p className="pt-md text-center text-body-sm text-on-surface-variant">
        Point camera at a barcode — it will scan automatically
      </p>
    </Dialog>
  )
}
