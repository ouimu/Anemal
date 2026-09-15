/**
 * BarcodeScanner — first test coverage (MODAL-11).
 *
 * Covers the Dialog migration (open/close via the dismissible policy — close
 * button, backdrop, Escape), the successful-scan callback path, and — the
 * critical requirement per the task spec — that no path can orphan the
 * camera `MediaStream`. `BarcodeScanner` has no `open` prop of its own; its
 * sole mount point (`views/clinic/ClinicInventory.tsx`) conditionally
 * mounts/unmounts it in response to `onClose`
 * (`{scanning && <BarcodeScanner onClose={() => setScanning(false)} />}`),
 * so each "close path" test below asserts the dismissal channel invokes
 * `onClose` and then unmounts the component (mirroring what the real parent
 * does) to assert the camera is actually released — not inferred from "it
 * used to work".
 *
 * `@zxing/browser`'s `BrowserMultiFormatReader` is mocked so tests never
 * touch a real camera: the mock hands the test direct control of the
 * decode callback zxing would otherwise invoke asynchronously per frame.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BarcodeScanner from '../components/BarcodeScanner/BarcodeScanner'

interface FakeScanResult {
  getText: () => string
}
interface FakeControls {
  stop: () => void
}
type DecodeCallback = (
  result: FakeScanResult | undefined,
  err: Error | undefined,
  controls: FakeControls
) => void

const h = vi.hoisted(() => ({
  decodeCallback: null as DecodeCallback | null,
  controls: { stop: vi.fn() } as FakeControls & { stop: ReturnType<typeof vi.fn> },
}))

vi.mock('@zxing/browser', () => ({
  // A `class`, not an arrow-returning vi.fn(): the hook calls
  // `new BrowserMultiFormatReader()`, and a mock factory that isn't a
  // `function`/`class` cannot be used as a constructor (vitest/JS rule, not
  // an Anemal one — see the vi.fn() docs on this exact error).
  BrowserMultiFormatReader: class {
    decodeFromVideoDevice(
      _deviceId: string | undefined,
      _videoEl: HTMLVideoElement,
      callback: DecodeCallback
    ): Promise<void> {
      h.decodeCallback = callback
      return Promise.resolve()
    }
  },
}))

vi.mock('@zxing/library', () => ({
  NotFoundException: class NotFoundException extends Error {},
}))

/** Marks the scanner controls as attached, matching the hook's first
 *  no-result callback invocation (sets `controlsRef` and `isReady`). */
function simulateCameraReady(): void {
  h.decodeCallback?.(undefined, undefined, h.controls)
}

/** Attaches a fake `MediaStream` (one fake video track) to the rendered
 *  `<video>` element's `srcObject`, so the hook's belt-and-suspenders
 *  cleanup (`getVideoTracks().forEach(t => t.stop())`) has something to
 *  find and stop. Returns the track's `stop` spy for assertion. */
function attachFakeStream(container: HTMLElement): { stop: ReturnType<typeof vi.fn> } {
  const track = { stop: vi.fn() }
  const videoEl = container.querySelector('video')
  if (!videoEl) throw new Error('video element not found')
  Object.defineProperty(videoEl, 'srcObject', {
    configurable: true,
    value: { getVideoTracks: () => [track] },
  })
  return track
}

beforeEach(() => {
  h.decodeCallback = null
  h.controls.stop.mockClear()
})

describe('BarcodeScanner — Dialog migration (dismissible, default)', () => {
  it('renders as an open dialog titled "Scan Barcode"', () => {
    render(<BarcodeScanner onScan={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Scan Barcode' })).toBeInTheDocument()
  })

  it('close (X) button invokes onClose', () => {
    const onClose = vi.fn()
    render(<BarcodeScanner onScan={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('backdrop click invokes onClose', () => {
    const onClose = vi.fn()
    const { container } = render(<BarcodeScanner onScan={vi.fn()} onClose={onClose} />)
    const backdrop = container.firstElementChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape invokes onClose', () => {
    const onClose = vi.fn()
    render(<BarcodeScanner onScan={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('BarcodeScanner — no orphaned MediaStream on any close path (R5)', () => {
  it('close (X) then unmount stops the scanner controls and every video track', () => {
    const onClose = vi.fn()
    const { container, unmount } = render(<BarcodeScanner onScan={vi.fn()} onClose={onClose} />)
    simulateCameraReady()
    const track = attachFakeStream(container)

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }))
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount() // mirrors ClinicInventory.tsx: onClose -> setScanning(false) -> unmount
    expect(h.controls.stop).toHaveBeenCalledTimes(1)
    expect(track.stop).toHaveBeenCalledTimes(1)
  })

  it('backdrop click then unmount stops the scanner controls and every video track', () => {
    const onClose = vi.fn()
    const { container, unmount } = render(<BarcodeScanner onScan={vi.fn()} onClose={onClose} />)
    simulateCameraReady()
    const track = attachFakeStream(container)
    const backdrop = container.firstElementChild as HTMLElement

    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
    expect(h.controls.stop).toHaveBeenCalledTimes(1)
    expect(track.stop).toHaveBeenCalledTimes(1)
  })

  it('Escape then unmount stops the scanner controls and every video track', () => {
    const onClose = vi.fn()
    const { container, unmount } = render(<BarcodeScanner onScan={vi.fn()} onClose={onClose} />)
    simulateCameraReady()
    const track = attachFakeStream(container)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
    expect(h.controls.stop).toHaveBeenCalledTimes(1)
    expect(track.stop).toHaveBeenCalledTimes(1)
  })

  it('component unmount alone (no explicit dismissal) stops the scanner controls and every video track', () => {
    const { container, unmount } = render(<BarcodeScanner onScan={vi.fn()} onClose={vi.fn()} />)
    simulateCameraReady()
    const track = attachFakeStream(container)

    unmount()
    expect(h.controls.stop).toHaveBeenCalledTimes(1)
    expect(track.stop).toHaveBeenCalledTimes(1)
  })
})

describe('BarcodeScanner — successful scan callback path', () => {
  it('a decoded result stops the controls immediately, reports the barcode, then closes', () => {
    const onScan = vi.fn()
    const onClose = vi.fn()
    render(<BarcodeScanner onScan={onScan} onClose={onClose} />)
    simulateCameraReady()

    h.decodeCallback?.({ getText: () => '4901234567894' }, undefined, h.controls)

    expect(h.controls.stop).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenCalledWith('4901234567894')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
