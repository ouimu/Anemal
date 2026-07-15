import { describe, it, expect } from 'vitest'
import { describeSaveError } from './errorMessages'

describe('describeSaveError', () => {
  it('returns the first field error message when present', () => {
    const err = { response: { data: { details: { fieldErrors: { newPassword: ['Password must be at least 8 characters'] } } } } }
    expect(describeSaveError(err)).toBe('newPassword: Password must be at least 8 characters')
  })

  it('returns "Save failed — <error>" when a top-level error string is present', () => {
    const err = { response: { data: { error: 'Current password is incorrect' } } }
    expect(describeSaveError(err)).toBe('Save failed — Current password is incorrect')
  })

  it('falls back to a generic message when no server error shape is recognized', () => {
    expect(describeSaveError({})).toBe('Save failed — check all fields.')
  })
})
