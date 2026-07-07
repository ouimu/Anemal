import { describe, it, expect } from 'vitest'
import type { CreateCustomerPayload, UpdateCustomerPayload } from './usePlatformCustomers'

describe('CreateCustomerPayload / UpdateCustomerPayload (BUG-002)', () => {
  it('does not allow trialEndsAt on create payload (compile-time check)', () => {
    const payload: CreateCustomerPayload = { name: 'Acme', subdomain: 'acme', planId: 1 }
    // @ts-expect-error trialEndsAt must not exist on CreateCustomerPayload
    payload.trialEndsAt = '2026-01-01'
    expect(payload.name).toBe('Acme')
  })

  it('does not allow trialEndsAt on update payload but keeps companyTypeId', () => {
    const payload: UpdateCustomerPayload = { name: 'Acme', companyTypeId: 3 }
    // @ts-expect-error trialEndsAt must not exist on UpdateCustomerPayload
    payload.trialEndsAt = '2026-01-01'
    expect(payload.companyTypeId).toBe(3)
  })
})
