import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'

export function useBarcodeScanner(
  onScan: (barcode: string) => void,
  active: boolean
): { videoRef: React.RefObject<HTMLVideoElement>; error: string | null; isReady: boolean } {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!active) return

    let cancelled = false
    const videoEl = videoRef.current  // capture for cleanup — avoids stale-ref warning

    const reader = new BrowserMultiFormatReader()

    reader
      .decodeFromVideoDevice(undefined, videoEl!, (result, err, controls) => {
        if (cancelled) {
          controls?.stop()
          return
        }

        if (!controlsRef.current) {
          controlsRef.current = controls ?? null
          setIsReady(true)
        }

        if (result) {
          controls?.stop()
          onScan(result.getText())
          return
        }

        if (err && !(err instanceof NotFoundException)) {
          setError(`Camera error: ${err.message}`)
        }
      })
      .catch((e: DOMException) => {
        if (cancelled) return
        if (e.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access and try again.')
        } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          setError('No camera found on this device.')
        } else if (e.name === 'NotReadableError') {
          setError('Camera is already in use by another app.')
        } else {
          setError(`Camera error: ${e.message}`)
        }
      })

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
      // Belt-and-suspenders: stop raw MediaStream tracks so camera LED turns off
      ;(videoEl?.srcObject as MediaStream)?.getVideoTracks().forEach(t => t.stop())
      setIsReady(false)
      setError(null)
    }
    // onScan is intentionally excluded — adding it causes re-subscription on every render
    // when the parent does not memoize the callback. Callers must wrap onScan in useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return { videoRef, error, isReady }
}
