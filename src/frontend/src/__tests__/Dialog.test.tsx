import { describe, it, expect, vi } from 'vitest'
import { useEffect, type FormEvent } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
// Vite `?raw` import — reads Dialog.tsx as plain text with no Node `fs`/`path`
// dependency, so this test needs no @types/node addition to the frontend.
import dialogSource from '../components/Dialog.tsx?raw'
import Dialog from '../components/Dialog'

/**
 * Contract tests for the shared Dialog shell.
 * Source of truth: docs/superpowers/plans/2026-09-11-modal-consolidation-arch-brief.md §4/§7
 * and docs/adr/0027-shared-modal-dismissal-policy-and-plane-neutrality.md.
 */

describe('Dialog — dismissal matrix (3 policies x 3 channels)', () => {
  it('dismissible: close (X), Escape and backdrop all invoke onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Dialog title="T" open onClose={onClose} dismissal="dismissible">
        <p>body</p>
      </Dialog>,
    )
    const backdrop = container.firstElementChild as HTMLElement

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }))
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('explicit: close (X) and Escape invoke onClose, backdrop is a no-op', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Dialog title="T" open onClose={onClose} dismissal="explicit">
        <p>body</p>
      </Dialog>,
    )
    const backdrop = container.firstElementChild as HTMLElement

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }))
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('blocking: no close control, Escape and backdrop are both no-ops', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Dialog title="T" open onClose={onClose} dismissal="blocking">
        <p>body</p>
      </Dialog>,
    )
    const backdrop = container.firstElementChild as HTMLElement
    expect(screen.queryByRole('button', { name: /close dialog/i })).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('blocking: renders role="alertdialog" and exposes no close control even without onClose', () => {
    render(
      <Dialog title="T" open dismissal="blocking">
        <p>body</p>
      </Dialog>,
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /close dialog/i })).not.toBeInTheDocument()
  })
})

describe('Dialog — stacked dialogs: Escape reaches only the topmost (ADR-0027 decision 1)', () => {
  // Found at the Step 7 /code-review pass. guards/RequireAuth.tsx:52 renders
  // IdleLogoutModal as a sibling of <Outlet/>, so the blocking idle warning
  // always opens ON TOP of whatever dialog the user already has open. Each
  // Dialog registers its own document-level keydown listener, so before this
  // guard, pressing Escape to dismiss the warning also unmounted the grooming
  // booking / stock adjustment / branch form underneath it — the exact
  // data-loss path the 'blocking' policy exists to prevent.
  it('a blocking dialog on top SWALLOWS Escape — the dismissible dialog underneath does not close', () => {
    const underneathClose = vi.fn()
    render(
      <>
        <Dialog title="Booking form" open onClose={underneathClose}>
          <p>unsaved work</p>
        </Dialog>
        <Dialog title="Session expiring" open dismissal="blocking">
          <p>countdown</p>
        </Dialog>
      </>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(underneathClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('unsaved work')).toBeInTheDocument()
  })

  it('a dismissible dialog on top closes on Escape while the one underneath stays open', () => {
    const underneathClose = vi.fn()
    const topClose = vi.fn()
    render(
      <>
        <Dialog title="Underneath" open onClose={underneathClose}>
          <p>underneath body</p>
        </Dialog>
        <Dialog title="On top" open onClose={topClose}>
          <p>top body</p>
        </Dialog>
      </>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(topClose).toHaveBeenCalledTimes(1)
    expect(underneathClose).not.toHaveBeenCalled()
  })

  it('once the top dialog unmounts, Escape returns to the dialog underneath', () => {
    const underneathClose = vi.fn()
    function Stack({ topOpen }: { topOpen: boolean }) {
      return (
        <>
          <Dialog title="Underneath" open onClose={underneathClose}>
            <p>underneath body</p>
          </Dialog>
          <Dialog title="On top" open={topOpen} dismissal="blocking">
            <p>top body</p>
          </Dialog>
        </>
      )
    }
    const { rerender } = render(<Stack topOpen />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(underneathClose).not.toHaveBeenCalled()

    rerender(<Stack topOpen={false} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(underneathClose).toHaveBeenCalledTimes(1)
  })
})

describe('Dialog — backdrop does not close on a drag-select that overshoots the panel', () => {
  // Found at the Step 7 /code-review pass. A mousedown inside the panel and a
  // mouseup outside it resolves the synthetic click to the nearest common
  // ancestor (the backdrop), so the panel's stopPropagation never runs. On a
  // touch-first tablet, selecting text in a textarea and releasing just past
  // the panel edge would have discarded the whole form.
  it('press starting inside the panel and released on the backdrop does NOT close', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Dialog title="T" open onClose={onClose}>
        <textarea defaultValue="notes the user was selecting" />
      </Dialog>,
    )
    const backdrop = container.firstElementChild as HTMLElement
    const panel = screen.getByRole('dialog')

    fireEvent.mouseDown(panel)
    fireEvent.click(backdrop)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('a genuine backdrop press (down and up both on the backdrop) still closes', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Dialog title="T" open onClose={onClose}>
        <p>body</p>
      </Dialog>,
    )
    const backdrop = container.firstElementChild as HTMLElement

    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the suppression is one-shot — a later genuine backdrop press still closes', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Dialog title="T" open onClose={onClose}>
        <textarea defaultValue="notes" />
      </Dialog>,
    )
    const backdrop = container.firstElementChild as HTMLElement
    const panel = screen.getByRole('dialog')

    fireEvent.mouseDown(panel)
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Dialog — F-9 regression guard', () => {
  it('the element carrying role/aria-modal is not the element carrying the backdrop click handler', () => {
    const onClose = vi.fn()
    render(
      <Dialog title="T" open onClose={onClose}>
        <p>body</p>
      </Dialog>,
    )
    const panel = screen.getByRole('dialog')
    expect(panel).toHaveAttribute('aria-modal', 'true')

    // Clicking the panel itself must NOT close — only the backdrop (the
    // panel's parent) carries the dismiss handler.
    fireEvent.click(panel)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Dialog — accessible naming and heading', () => {
  it('aria-labelledby resolves to the <h2> whose text is the title; no aria-label', () => {
    render(
      <Dialog title="My Title" open onClose={vi.fn()}>
        <p>body</p>
      </Dialog>,
    )
    const panel = screen.getByRole('dialog')
    const heading = screen.getByRole('heading', { level: 2, name: 'My Title' })
    expect(panel).toHaveAttribute('aria-labelledby', heading.id)
    expect(panel).not.toHaveAttribute('aria-label')
  })
})

/**
 * Regression guard added at Step 7 by @qa-agent, from a /code-review finding.
 *
 * The close (X) button carried no `type`, so it defaulted to `type="submit"`.
 * `StoragePage.tsx` renders its storage-switch confirm <Dialog> INSIDE the
 * page-level `<form onSubmit={handleSave}>`, which made that form the close
 * button's form owner: clicking X both closed the dialog AND re-submitted the
 * storage-config save the dialog existed to confirm. The cancel affordance
 * performed the action it was there to cancel.
 *
 * Latent at every one of the 17 call sites, which is the hazard a shared shell
 * creates — one missing attribute is a bug in every consumer at once. Fixed in
 * `Dialog` rather than per-consumer; asserted both structurally and
 * behaviourally so neither spelling of the regression can return.
 */
describe('Dialog — close control does not submit an enclosing form', () => {
  it('the close (X) control is type="button", not the HTML default submit', () => {
    render(
      <Dialog title="T" open onClose={vi.fn()}>
        <p>body</p>
      </Dialog>,
    )
    expect(screen.getByRole('button', { name: /close dialog/i })).toHaveAttribute('type', 'button')
  })

  it('clicking close inside a page-level <form> dismisses without submitting it', () => {
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault())
    const onClose = vi.fn()
    render(
      <form onSubmit={onSubmit}>
        <Dialog title="Confirm" open onClose={onClose} dismissal="explicit">
          <p>body</p>
        </Dialog>
      </form>,
    )

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('Dialog — close control size', () => {
  it('close (X) control has an accessible name and a >= 44x44 target', () => {
    render(
      <Dialog title="T" open onClose={vi.fn()}>
        <p>body</p>
      </Dialog>,
    )
    const closeButton = screen.getByRole('button', { name: /close dialog/i })
    expect(closeButton.className).toMatch(/min-h-\[44px\]/)
    expect(closeButton.className).toMatch(/min-w-\[44px\]/)
  })
})

describe('Dialog — footer slot', () => {
  it('footer absent renders no footer element', () => {
    render(
      <Dialog title="T" open onClose={vi.fn()}>
        <p>body</p>
      </Dialog>,
    )
    expect(screen.queryByText('Footer content')).not.toBeInTheDocument()
  })

  it('footer present renders outside the scrolling body', () => {
    render(
      <Dialog title="T" open onClose={vi.fn()} footer={<span>Footer content</span>}>
        <p>body</p>
      </Dialog>,
    )
    const footerText = screen.getByText('Footer content')
    const bodyText = screen.getByText('body')
    const scrollingBody = bodyText.closest('.overflow-y-auto')
    // The footer must not be inside the scrolling body container — it is a
    // sibling of it under the panel, per the flex-column structural contract.
    expect(scrollingBody).not.toBeNull()
    expect(scrollingBody?.contains(footerText)).toBe(false)
  })
})

describe('Dialog — resource lifecycle (R5)', () => {
  it('open=false unmounts children — a probe child cleanup runs', () => {
    const cleanup = vi.fn()
    function Probe() {
      useEffect(() => cleanup, [])
      return <span>probe</span>
    }
    const { rerender } = render(
      <Dialog title="T" open onClose={vi.fn()}>
        <Probe />
      </Dialog>,
    )
    expect(screen.getByText('probe')).toBeInTheDocument()
    expect(cleanup).not.toHaveBeenCalled()

    rerender(
      <Dialog title="T" open={false} onClose={vi.fn()}>
        <Probe />
      </Dialog>,
    )
    expect(screen.queryByText('probe')).not.toBeInTheDocument()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('open=false renders nothing', () => {
    const { container } = render(
      <Dialog title="T" open={false} onClose={vi.fn()}>
        <p>body</p>
      </Dialog>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Dialog — plane-neutrality import allowlist (R7)', () => {
  it('imports only react and MaterialIcon — no plane-specific dependency', () => {
    const importLines = dialogSource.match(/^import .+ from ['"].+['"]$/gm) ?? []
    const importSources = importLines.map((line: string): string => {
      const m = line.match(/from ['"](.+)['"]$/)
      return m ? m[1] : ''
    })
    const allowlist = ['react', './MaterialIcon']
    for (const importSource of importSources) {
      expect(allowlist).toContain(importSource)
    }
    // Fails loudly if the module stops importing anything at all (a vacuous
    // pass would defeat the point of this guard).
    expect(importSources.length).toBeGreaterThan(0)
  })
})
