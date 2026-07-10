// src/frontend/src/__tests__/VitalStepper.test.tsx
// Group C — vitals free-text input hardening (idempotent commit, Enter/blur, onWheel
// guard, round+clamp). Wraps VitalStepper in a real useState parent (matching how
// ClinicEMR actually uses it) so the idempotency check against the controlled `value`
// prop is exercised the same way it is in production.
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { VitalStepper } from '../views/clinic/ClinicEMR'

function Wrapper({
  initial = null, step = 0.1, min = 0, max, onChangeSpy,
}: { initial?: number | null; step?: number; min?: number; max?: number; onChangeSpy: (v: number | null) => void }) {
  const [value, setValue] = useState<number | null>(initial)
  return (
    <VitalStepper
      label="Weight"
      unit="kg"
      value={value}
      onChange={(v) => { setValue(v); onChangeSpy(v) }}
      step={step}
      min={min}
      max={max}
    />
  )
}

function input(): HTMLInputElement {
  return screen.getByLabelText('Weight') as HTMLInputElement
}

describe('VitalStepper — C1 rendering', () => {
  it('renders a number input with the correct value', () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper initial={12.5} onChangeSpy={onChangeSpy} />)
    expect(input()).toHaveAttribute('type', 'number')
    expect(input().value).toBe('12.5')
  })
})

describe('VitalStepper — C2 commit logic', () => {
  it('typed decimal commits on blur', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper onChangeSpy={onChangeSpy} />)
    await userEvent.clear(input())
    await userEvent.type(input(), '12.34')
    fireEvent.blur(input())
    expect(onChangeSpy).toHaveBeenCalledWith(12.3)
  })

  it('typed integer commits for HR/RR (step=1)', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper step={1} min={1} onChangeSpy={onChangeSpy} />)
    await userEvent.type(input(), '120')
    fireEvent.blur(input())
    expect(onChangeSpy).toHaveBeenCalledWith(120)
  })

  it('empty input commits null', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper initial={5} onChangeSpy={onChangeSpy} />)
    await userEvent.clear(input())
    fireEvent.blur(input())
    expect(onChangeSpy).toHaveBeenCalledWith(null)
  })

  it('letters ignored by type=number, invalid → null', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper initial={5} onChangeSpy={onChangeSpy} />)
    await userEvent.clear(input())
    await userEvent.type(input(), 'abc')
    fireEvent.blur(input())
    expect(onChangeSpy).toHaveBeenCalledWith(null)
  })

  it('negative value → null', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper onChangeSpy={onChangeSpy} />)
    await userEvent.type(input(), '-5')
    fireEvent.blur(input())
    expect(onChangeSpy).toHaveBeenCalledWith(null)
  })

  it('zero → null', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper onChangeSpy={onChangeSpy} />)
    await userEvent.type(input(), '0')
    fireEvent.blur(input())
    expect(onChangeSpy).toHaveBeenCalledWith(null)
  })

  it('over-max value clamped to max', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper step={1} min={1} max={3000} onChangeSpy={onChangeSpy} />)
    await userEvent.type(input(), '5000')
    fireEvent.blur(input())
    expect(onChangeSpy).toHaveBeenCalledWith(3000)
  })

  it('leading zeros parse correctly', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper onChangeSpy={onChangeSpy} />)
    await userEvent.type(input(), '007.5')
    fireEvent.blur(input())
    expect(onChangeSpy).toHaveBeenCalledWith(7.5)
  })

  it('scientific notation commits via valueAsNumber then clamps', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper step={1} min={1} max={3000} onChangeSpy={onChangeSpy} />)
    fireEvent.change(input(), { target: { value: '1e2' } })
    fireEvent.blur(input())
    expect(onChangeSpy).toHaveBeenCalledWith(100)
  })

  it('sub-step rounding to 0 becomes null', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper step={1} min={1} onChangeSpy={onChangeSpy} />)
    await userEvent.type(input(), '0.4')
    fireEvent.blur(input())
    expect(onChangeSpy).toHaveBeenCalledWith(null)
  })

  it('Enter commits and does not submit an enclosing form', async () => {
    const onChangeSpy = vi.fn()
    const submitSpy = vi.fn(e => e.preventDefault())
    render(
      <form onSubmit={submitSpy}>
        <Wrapper onChangeSpy={onChangeSpy} />
      </form>
    )
    await userEvent.type(input(), '12.3{Enter}')
    expect(onChangeSpy).toHaveBeenCalledWith(12.3)
    expect(submitSpy).not.toHaveBeenCalled()
  })

  it('Enter followed by the blur it triggers commits exactly once', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper onChangeSpy={onChangeSpy} />)
    await userEvent.type(input(), '12.34{Enter}')
    fireEvent.blur(input())
    expect(onChangeSpy).toHaveBeenCalledTimes(1)
    expect(onChangeSpy).toHaveBeenCalledWith(12.3)
  })

  it('onWheel blurs the input', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper onChangeSpy={onChangeSpy} />)
    input().focus()
    expect(document.activeElement).toBe(input())
    fireEvent.wheel(input())
    expect(document.activeElement).not.toBe(input())
  })
})

describe('VitalStepper — C3 buttons after typing', () => {
  it('typing a value then clicking + increments from the typed value, not a stale one', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper onChangeSpy={onChangeSpy} />)
    await userEvent.type(input(), '10')
    fireEvent.blur(input())
    expect(onChangeSpy).toHaveBeenLastCalledWith(10)
    await userEvent.click(screen.getByText('+'))
    expect(onChangeSpy).toHaveBeenLastCalledWith(10.1)
  })
})

describe('VitalStepper — C4 save-path wiring', () => {
  it('save sends the typed value (onChange feeds the parent state that saveRecord reads)', async () => {
    const onChangeSpy = vi.fn()
    render(<Wrapper onChangeSpy={onChangeSpy} />)
    await userEvent.type(input(), '18.6')
    fireEvent.blur(input())
    expect(onChangeSpy).toHaveBeenCalledWith(18.6)
    expect(input().value).toBe('18.6')
  })
})
