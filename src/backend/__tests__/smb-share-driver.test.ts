// src/backend/__tests__/smb-share-driver.test.ts
import { SmbShareDriver } from '../config/smb-share-driver'
import { FakeSmbClient } from './helpers/fakeSmbClient'
import { StorageNotFoundError, StorageUnavailableError } from '../config/storage-driver'
import { SmbHostUnreachableError, SmbShareNotFoundError, SmbAuthRejectedError } from '../config/smb-client'

const fakeConfig = { host: 'fake-host', share: 'fake-share', username: 'u', password: 'p' }

describe('SmbShareDriver', () => {
  test('save() then read() round-trips the exact bytes', async () => {
    const client = new FakeSmbClient()
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('img-bytes'), 'image/jpeg')
    const buf = await driver.read('tenants/1/photo/pet-1.jpg')
    expect(buf.toString()).toBe('img-bytes')
  })

  test('save() writes to a temp name then renames (grill finding #2, mirrors LocalDiskDriver)', async () => {
    const client = new FakeSmbClient()
    const writeSpy = jest.spyOn(client, 'writeFile')
    const renameSpy = jest.spyOn(client, 'rename')
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await driver.save('a/b.txt', Buffer.from('x'), 'text/plain')
    expect(writeSpy).toHaveBeenCalledWith(expect.stringMatching(/\.tmp-/), expect.any(Buffer))
    expect(renameSpy).toHaveBeenCalledWith(expect.stringMatching(/\.tmp-/), 'a/b.txt')
  })

  test('exists() is false before save and true after', async () => {
    const client = new FakeSmbClient()
    const driver = new SmbShareDriver(fakeConfig, () => client)
    expect(await driver.exists('never.txt')).toBe(false)
    await driver.save('never.txt', Buffer.from('x'), 'text/plain')
    expect(await driver.exists('never.txt')).toBe(true)
  })

  test('read() on a missing key throws StorageNotFoundError, not the raw client error', async () => {
    const client = new FakeSmbClient()
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await expect(driver.read('ghost.txt')).rejects.toBeInstanceOf(StorageNotFoundError)
  })

  test('delete() is idempotent on an already-missing key', async () => {
    const client = new FakeSmbClient()
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await expect(driver.delete('nothing.txt')).resolves.toBeUndefined()
  })

  test('connection failure (unreachable host) surfaces as StorageUnavailableError from save/read/exists', async () => {
    const client = new FakeSmbClient({ failConnectAs: 'unreachable' })
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await expect(driver.save('a.txt', Buffer.from('x'), 'text/plain')).rejects.toBeInstanceOf(StorageUnavailableError)
    await expect(driver.exists('a.txt')).rejects.toBeInstanceOf(StorageUnavailableError)
  })

  test('connect() opens and disconnect() closes per-operation — no persistent pooled connection (ADR-0023 §2)', async () => {
    const client = new FakeSmbClient()
    const connectSpy = jest.spyOn(client, 'connect')
    const disconnectSpy = jest.spyOn(client, 'disconnect')
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await driver.save('a.txt', Buffer.from('x'), 'text/plain')
    await driver.read('a.txt')
    expect(connectSpy).toHaveBeenCalledTimes(2) // once per operation, not shared
    expect(disconnectSpy).toHaveBeenCalledTimes(2)
  })
})

// PLAN DEVIATION (flagged, not silently resolved): the plan's Task 5 test file
// asserted BOTH that connect failures surface as StorageUnavailableError
// (the "connection failure ... surfaces as StorageUnavailableError" test
// above) AND that the same failure modes surface as their distinct
// SmbHostUnreachableError/SmbShareNotFoundError/SmbAuthRejectedError types
// via a test.each block here — those two expectations are mutually
// exclusive for the same driver.save() call (an error can't be an
// instanceof two unrelated AppError subclasses at once). Resolved per
// grill finding #3 + parity with LocalDiskDriver: SmbShareDriver always
// normalizes non-not-found failures to StorageUnavailableError for its
// normal read/write/delete/exists callers (getStorageDriver's consumers).
// Task 4's own interface note says Sub-PR B's connect-test-write (Task 8)
// calls `createSmbClient` directly rather than through SmbShareDriver
// specifically so it CAN see the distinct Smb* classification — that
// caller never goes through this wrapping, so nothing here blocks it.
describe('SmbShareDriver — connect-time failures of every kind wrap uniformly (grill #3 parity, see PLAN DEVIATION note above)', () => {
  test.each([
    ['unreachable', SmbHostUnreachableError.name],
    ['share-not-found', SmbShareNotFoundError.name],
    ['auth-rejected', SmbAuthRejectedError.name],
  ] as const)('%s connect failure (%s) still surfaces as StorageUnavailableError from save()', async (failMode) => {
    const client = new FakeSmbClient({ failConnectAs: failMode })
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await expect(driver.save('a.txt', Buffer.from('x'), 'text/plain')).rejects.toBeInstanceOf(StorageUnavailableError)
  })
})
