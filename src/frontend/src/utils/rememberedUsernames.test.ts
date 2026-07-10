import { describe, it, expect, beforeEach, vi } from 'vitest'
import { list, upsert, remove } from './rememberedUsernames'

const STORAGE_KEY = 'vc_remembered_usernames'

describe('rememberedUsernames', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('upsert — new entry is added', () => {
    upsert('dev-clinic', 'alice')
    const entries = list('dev-clinic')
    expect(entries).toHaveLength(1)
    expect(entries[0].username).toBe('alice')
    expect(entries[0].subdomain).toBe('dev-clinic')
  })

  it('upsert — existing (subdomain, username) pair bumps to front and refreshes lastUsedAt', () => {
    upsert('dev-clinic', 'alice')
    upsert('dev-clinic', 'bob')
    const firstLastUsedAt = list('dev-clinic').find(e => e.username === 'alice')?.lastUsedAt
    // Ensure a distinguishable timestamp on the refresh.
    vi.useFakeTimers()
    vi.setSystemTime(new Date((firstLastUsedAt ?? 0) + 1000))
    upsert('dev-clinic', 'alice')
    vi.useRealTimers()

    const entries = list('dev-clinic')
    expect(entries).toHaveLength(2)
    expect(entries[0].username).toBe('alice')
    expect(entries[0].lastUsedAt).toBeGreaterThan(firstLastUsedAt ?? 0)
  })

  it('remove — present entry is removed', () => {
    upsert('dev-clinic', 'alice')
    upsert('dev-clinic', 'bob')
    remove('dev-clinic', 'alice')
    const entries = list('dev-clinic')
    expect(entries).toHaveLength(1)
    expect(entries[0].username).toBe('bob')
  })

  it('remove — absent entry is a no-op', () => {
    upsert('dev-clinic', 'bob')
    remove('dev-clinic', 'alice')
    expect(list('dev-clinic')).toHaveLength(1)
  })

  it('corrupt JSON under the storage key recovers to an empty list', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    expect(list('dev-clinic')).toEqual([])
  })

  it('localStorage.getItem/setItem throwing degrades silently (no throw out of list/upsert/remove)', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private mode')
    })

    expect(() => list('dev-clinic')).not.toThrow()
    expect(() => upsert('dev-clinic', 'alice')).not.toThrow()
    expect(() => remove('dev-clinic', 'alice')).not.toThrow()
    expect(list('dev-clinic')).toEqual([])

    getSpy.mockRestore()
    setSpy.mockRestore()
  })

  it('list(subdomain) returns only entries saved under that subdomain, matched case-insensitively (Dev-Clinic finds dev-clinic)', () => {
    upsert('dev-clinic', 'alice')
    upsert('other-clinic', 'carol')
    const entries = list('Dev-Clinic')
    expect(entries).toHaveLength(1)
    expect(entries[0].username).toBe('alice')
  })

  it('entry lacking a subdomain field is never returned by list', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ username: 'alice', lastUsedAt: Date.now() }]),
    )
    expect(list('dev-clinic')).toEqual([])
  })

  it('username matching is case-insensitive — upsert("dev-clinic","Alice") then upsert("dev-clinic","alice") results in exactly one entry, displaying "alice"', () => {
    upsert('dev-clinic', 'Alice')
    upsert('dev-clinic', 'alice')
    const entries = list('dev-clinic')
    expect(entries).toHaveLength(1)
    expect(entries[0].username).toBe('alice')
  })
})
