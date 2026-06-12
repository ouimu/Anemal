import { useCallback } from 'react'
import MaterialIcon from '../MaterialIcon'
import { useBarcodeScanner } from './useBarcodeScanner'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
}

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Barcode Scanner"
    >
      <div className="bg-surface rounded-2xl shadow-lvl3 w-full max-w-sm mx-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant">
          <div className="flex items-center">
            <MaterialIcon name="qr_code_scanner" size={20} className="text-secondary mr-sm" />
            <span className="text-title-md font-headline font-bold text-on-surface">Scan Barcode</span>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors"
            aria-label="Close scanner"
          >
            <MaterialIcon name="close" size={22} />
          </button>
        </div>

        {/* Video */}
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

        {/* Error */}
        {error && (
          <div className="px-lg py-md flex items-start gap-sm text-error">
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

        {/* Footer */}
        <div className="px-lg py-md text-center text-body-sm text-on-surface-variant">
          Point camera at a barcode — it will scan automatically
        </div>
      </div>
    </div>
  )
}
