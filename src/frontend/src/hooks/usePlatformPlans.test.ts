import { describe, it, expect } from 'vitest'
import { toWirePayload } from './usePlatformPlans'

describe('toWirePayload (BUG-003)', () => {
  it('translates price -> priceMonth and features string[] -> Record<string, true>', () => {
    const wire = toWirePayload({
      key: 'pro', name: 'Pro', price: 999,
      maxBranches: 5, maxUsers: 20, maxOwners: null,
      features: ['sms', 'line'],
    })
    expect(wire).toEqual({
      key: 'pro', name: 'Pro', priceMonth: 999,
      maxBranches: 5, maxUsers: 20, maxOwners: null,
      features: { sms: true, line: true },
    })
  })

  it('omits features key entirely when not provided (partial update)', () => {
    const wire = toWirePayload({ price: 1200 })
    expect(wire).toEqual({ priceMonth: 1200 })
    expect(wire.features).toBeUndefined()
  })

  it('preserves key immutability: update payload never includes key at the type level', () => {
    const updatePayload: import('./usePlatformPlans').UpdatePlanPayload = { name: 'Renamed' }
    // @ts-expect-error key is not assignable on UpdatePlanPayload (Omit<CreatePlanPayload, 'key'>)
    updatePayload.key = 'new-key'
    expect(updatePayload.name).toBe('Renamed')
  })

  it('toWirePayload passes maxPets through unchanged', () => {
    const payload: import('./usePlatformPlans').CreatePlanPayload = {
      key: 'test', name: 'Test', price: 0,
      maxBranches: 1, maxUsers: 5, maxOwners: 100, maxPets: 500,
    }
    const wire = toWirePayload(payload)
    expect(wire.maxPets).toBe(500)
  })
})
