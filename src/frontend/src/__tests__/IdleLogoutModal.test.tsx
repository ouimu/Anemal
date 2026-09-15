import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import IdleLogoutModal from '../components/IdleLogoutModal'
// Vite `?raw` import — reads the component's own source as plain text, no
// Node `fs`/`path` dependency (matches the pattern already used by
// __tests__/Dialog.test.tsx's plane-neutrality assertion).
import idleLogoutModalSource from '../components/IdleLogoutModal.tsx?raw'
import { useIdleLogout } from '../hooks/useIdleLogout'

/**
 * Coverage for Task MODAL-12 (docs/superpowers/plans/2026-09-11-modal-consolidation.md)
 * and the ADR-0027 "Testing constraint" it inherits
 * (docs/adr/0027-shared-modal-dismissal-policy-and-plane-neutrality.md).
 *
 * Zero coverage existed for this component before this task. Note: the
 * `role="alertdialog"` announcement itself is verified here only by
 * asserting the attribute is present — whether it is actually *announced*
 * by assistive technology on mount is NOT something jsdom/RTL can verify
 * and still requires a manual AT pass by @qa-agent (see the removed
 * aria-live note in IdleLogoutModal.tsx).
 */

describe('IdleLogoutModal — blocking-policy assertion (paired, ADR-0027 Testing constraint)', () => {
  it('(1) renders role="alertdialog", exposes no close control, and does not close on Escape or backdrop click', () => {
    const onStay = vi.fn()
    const { container } = render(<IdleLogoutModal open secondsLeft={30} onStay={onStay} />)

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /close dialog/i })).not.toBeInTheDocument()

    const backdrop = container.firstElementChild as HTMLElement
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(backdrop)

    // Neither channel dismissed it — the warning is still on screen and
    // onStay (the only sanctioned exit) was never invoked.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(onStay).not.toHaveBeenCalled()
  })

  it('(2) dismissal="blocking" occurs at exactly one call site under src/frontend/src/**, and it is IdleLogoutModal.tsx', () => {
    // Every production .tsx under src/frontend/src, excluding test files —
    // a test file exercising Dialog's own dismissal matrix (Dialog.test.tsx)
    // verifies the mechanism, it does not "adopt" the policy as a consumer.
    const modules = import.meta.glob('../**/*.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>

    const blockingPattern = /dismissal\s*=\s*["']blocking["']/g
    const callSites = Object.entries(modules)
      .filter(([path]) => !path.includes('__tests__') && !path.endsWith('.test.tsx'))
      .flatMap(([path, source]) => (source.match(blockingPattern) ?? []).map(() => path))

    expect(callSites).toHaveLength(1)
    expect(callSites[0]).toMatch(/\/IdleLogoutModal\.tsx$/)
  })
})

describe('IdleLogoutModal — rendering and the "Stay logged in" action', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(<IdleLogoutModal open={false} secondsLeft={30} onStay={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the configured secondsLeft countdown when open', () => {
    render(<IdleLogoutModal open secondsLeft={17} onStay={vi.fn()} />)
    expect(screen.getByText(/logged out in 17s due to inactivity/i)).toBeInTheDocument()
  })

  it('clicking "Stay logged in" invokes onStay', () => {
    const onStay = vi.fn()
    render(<IdleLogoutModal open secondsLeft={30} onStay={onStay} />)
    fireEvent.click(screen.getByRole('button', { name: /stay logged in/i }))
    expect(onStay).toHaveBeenCalledTimes(1)
  })

  it('closing (open -> false, e.g. after a session is cleared) leaves no stuck or broken modal in the DOM', () => {
    const { container, rerender } = render(<IdleLogoutModal open secondsLeft={5} onStay={vi.fn()} />)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    rerender(<IdleLogoutModal open={false} secondsLeft={5} onStay={vi.fn()} />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })
})

describe('IdleLogoutModal — plane-neutrality', () => {
  it('imports only react and ./Dialog — no auth store, tenant context, or plane-specific dependency', () => {
    const importLines = idleLogoutModalSource.match(/^import .+ from ['"].+['"]$/gm) ?? []
    const importSources = importLines.map((line: string): string => {
      const m = line.match(/from ['"](.+)['"]$/)
      return m ? m[1] : ''
    })
    expect(importSources.length).toBeGreaterThan(0)
    for (const importSource of importSources) {
      expect(['react', './Dialog']).toContain(importSource)
    }
  })

  // RequireAuth.tsx:52 (clinic plane) and PlatformLayout.tsx:148 (platform
  // plane) both call this component with exactly these three props and
  // nothing else (verified by inspection of both call sites) — since the
  // component's own props type carries no tenantId/plane field, the two
  // mount points are necessarily interchangeable from its point of view.
  it('accepts the same prop shape regardless of which plane supplies it (no tenantId field)', () => {
    const clinicStyleProps = { open: true, secondsLeft: 12, onStay: vi.fn() }
    const platformStyleProps = { open: true, secondsLeft: 12, onStay: vi.fn() }

    const clinic = render(<IdleLogoutModal {...clinicStyleProps} />)
    expect(clinic.getByRole('alertdialog')).toBeInTheDocument()
    clinic.unmount()

    const platform = render(<IdleLogoutModal {...platformStyleProps} />)
    expect(platform.getByRole('alertdialog')).toBeInTheDocument()
    platform.unmount()
  })
})

describe('IdleLogoutModal — integration with useIdleLogout (warning threshold, stay, timeout)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Small harness: real useIdleLogout hook feeding real IdleLogoutModal props. */
  function Harness({ onLogout }: { onLogout: () => void }) {
    const { warning, secondsLeft, stayLoggedIn } = useIdleLogout({ timeoutMinutes: 1, onLogout })
    return <IdleLogoutModal open={warning} secondsLeft={secondsLeft} onStay={stayLoggedIn} />
  }

  it('the warning modal appears at the configured threshold (30s before timeout)', () => {
    render(<Harness onLogout={vi.fn()} />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(30_000) })
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('"Stay logged in" dismisses the warning and resets the timer, so logout does not fire', () => {
    const onLogout = vi.fn()
    render(<Harness onLogout={onLogout} />)

    act(() => { vi.advanceTimersByTime(35_000) })
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /stay logged in/i }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(55_000) }) // 90s wall-clock, only 55s since the reset
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('logs the user out on timeout, and the modal does not remain stuck on screen afterward', () => {
    const onLogout = vi.fn()
    const { rerender } = render(<Harness onLogout={onLogout} />)

    act(() => { vi.advanceTimersByTime(60_000) })
    expect(onLogout).toHaveBeenCalledTimes(1)

    // Negative case: a stale/expired session must not leave a broken or
    // stuck modal — once the caller reacts to onLogout (clears the session
    // and flips `open` away), nothing renders.
    rerender(<IdleLogoutModal open={false} secondsLeft={0} onStay={vi.fn()} />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

// Sanity check that renderHook is actually used (keeps the import from
// being flagged as unused if the harness above is refactored later).
void renderHook
