/**
 * RESP-2t — TopNav({ shell }). The ShellSidebar arrives as a prop; the top bar
 * takes its left-* class from shell.offset.top and shows the hamburger only in
 * drawer mode (arch 4d, A-7).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ShellSidebar } from '../hooks/useShellSidebar'
import topNavSource from '../components/TopNav.tsx?raw'

vi.mock('../components/ProfileMenu', () => ({ default: () => <div data-testid="profile-menu" /> }))

import TopNav from '../components/TopNav'

function shellFor(over: Partial<ShellSidebar> = {}): ShellSidebar {
  return {
    mode: 'expanded',
    expanded: true,
    drawerOpen: false,
    offset: { main: 'ml-56', top: 'left-56' },
    toggleExpanded: vi.fn(),
    openDrawer: vi.fn(),
    closeDrawer: vi.fn(),
    ...over,
  }
}

function renderTopNav(shell: ShellSidebar) {
  return render(
    <MemoryRouter initialEntries={['/clinic/dashboard']}>
      <TopNav shell={shell} />
    </MemoryRouter>,
  )
}

const header = (): HTMLElement => screen.getByRole('banner')

describe('TopNav — offset from the shell', () => {
  it('carries shell.offset.top verbatim (expanded)', () => {
    renderTopNav(shellFor())
    expect(header().className).toContain('left-56')
    expect(header().className).not.toContain('left-14')
  })

  it('@AC-RESP-3-3 follows a rail-band expansion (push): left-56 from the shell', () => {
    renderTopNav(shellFor({ mode: 'rail', expanded: true, offset: { main: 'ml-56', top: 'left-56' } }))
    expect(header().className).toContain('left-56')
  })

  it('carries left-14 for the collapsed rail', () => {
    renderTopNav(shellFor({ mode: 'rail', expanded: false, offset: { main: 'ml-14', top: 'left-14' } }))
    expect(header().className).toContain('left-14')
  })

  it('@AC-RESP-3-2 spans the full viewport (left-0) in drawer mode', () => {
    renderTopNav(shellFor({ mode: 'drawer', expanded: false, offset: { main: 'ml-0', top: 'left-0' } }))
    expect(header().className).toContain('left-0')
    expect(header().className).toContain('right-0')
  })

  it('stays on the top-bar layer z-40', () => {
    renderTopNav(shellFor())
    expect(header().className).toContain('z-40')
  })
})

describe('TopNav — hamburger', () => {
  it('@AC-RESP-2-1 no hamburger in expanded mode', () => {
    renderTopNav(shellFor({ mode: 'expanded' }))
    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument()
  })

  it('@AC-RESP-2-2 no hamburger in rail mode', () => {
    renderTopNav(shellFor({ mode: 'rail', expanded: false }))
    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument()
  })

  it('@AC-RESP-2-3 hamburger shown in drawer mode and calls openDrawer', () => {
    const openDrawer = vi.fn()
    renderTopNav(shellFor({ mode: 'drawer', expanded: false, offset: { main: 'ml-0', top: 'left-0' }, openDrawer }))
    const button = screen.getByRole('button', { name: 'Open menu' })
    expect(button.className).toContain('min-h-[44px]')
    fireEvent.click(button)
    expect(openDrawer).toHaveBeenCalledTimes(1)
  })
})

describe('TopNav — no local offset composition', () => {
  it('does not read uiStore nor compose an offset class', () => {
    expect(topNavSource).not.toMatch(/uiStore|useUiStore/)
    expect(topNavSource).not.toMatch(/(?:ml|left)-\$\{/)
  })
})
