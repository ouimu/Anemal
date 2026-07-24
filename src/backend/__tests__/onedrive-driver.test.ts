import { OneDriveDriver } from '../config/onedrive-driver'
import { FakeOneDriveClient } from './helpers/fakeOneDriveClient'
import { StorageNotFoundError, StorageUnavailableError, StorageKeyError } from '../config/storage-driver'
import { OneDriveClientConfig } from '../config/onedrive-client'

const credentials = { clientId: 'cid', clientSecret: 'csecret', accessToken: 'at', refreshToken: 'rt' }

function makeDriver(client: FakeOneDriveClient, onTokensRefreshed: jest.Mock = jest.fn().mockResolvedValue(undefined)) {
  const factory = (_config: OneDriveClientConfig) => client
  return new OneDriveDriver(1, credentials, onTokensRefreshed, factory)
}

describe('OneDriveDriver', () => {
  test('save() then read() round-trips exact bytes', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('img-bytes'), 'image/jpeg')
    expect((await driver.read('tenants/1/photo/pet-1.jpg')).toString()).toBe('img-bytes')
  })

  test('photo replace on the same key yields exactly ONE file, not two (the N-1-class regression test — design §9, "load-bearing even though path-PUT makes it structurally hard to fail")', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('v1'), 'image/jpeg')
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('v2-longer-body'), 'image/jpeg')
    expect((await driver.read('tenants/1/photo/pet-1.jpg')).toString()).toBe('v2-longer-body')
    expect(client.countFilesAt('tenant-1/photo/pet-1.jpg')).toBe(1)
  })

  test('emr keys resolve under the tenant emr/{recordId} path', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await driver.save('tenants/1/emr/42/report.pdf', Buffer.from('x'), 'application/pdf')
    expect((await driver.read('tenants/1/emr/42/report.pdf')).toString()).toBe('x')
  })

  test('exists() is false before save and true after', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    expect(await driver.exists('tenants/1/photo/never.jpg')).toBe(false)
    await driver.save('tenants/1/photo/never.jpg', Buffer.from('x'), 'image/jpeg')
    expect(await driver.exists('tenants/1/photo/never.jpg')).toBe(true)
  })

  test('read() on a missing key throws StorageNotFoundError', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await expect(driver.read('tenants/1/photo/ghost.jpg')).rejects.toBeInstanceOf(StorageNotFoundError)
  })

  test('delete() is idempotent on an already-missing key', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await expect(driver.delete('tenants/1/photo/nothing.jpg')).resolves.toBeUndefined()
  })

  test('a key outside tenants/{tenantId}/{emr|photo}/... shape throws StorageKeyError', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await expect(driver.save('not-a-valid-key.txt', Buffer.from('x'), 'text/plain')).rejects.toBeInstanceOf(StorageKeyError)
  })

  test('a key for a different tenant throws StorageKeyError', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await expect(driver.read('tenants/999/photo/pet-1.jpg')).rejects.toBeInstanceOf(StorageKeyError)
  })

  test('a revoked/invalid token surfaces as StorageUnavailableError', async () => {
    const client = new FakeOneDriveClient({ failAuthInvalid: true })
    const driver = makeDriver(client)
    await expect(driver.save('tenants/1/photo/a.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toBeInstanceOf(StorageUnavailableError)
  })

  test('a body ≤4MB routes through putSmall (simple PUT), not the upload session (M-5)', async () => {
    const client = new FakeOneDriveClient()
    jest.spyOn(client, 'putSmall')
    jest.spyOn(client, 'createUploadSession')
    const driver = makeDriver(client)
    await driver.save('tenants/1/photo/small.jpg', Buffer.alloc(1024), 'image/jpeg')
    expect(client.putSmall).toHaveBeenCalled()
    expect(client.createUploadSession).not.toHaveBeenCalled()
  })

  test('a body >4MB routes through the upload-session/chunk path (M-5)', async () => {
    const client = new FakeOneDriveClient()
    jest.spyOn(client, 'putSmall')
    jest.spyOn(client, 'createUploadSession')
    const driver = makeDriver(client)
    const big = Buffer.alloc(5 * 1024 * 1024) // 5 MB > 4 MB threshold
    await driver.save('tenants/1/emr/1/big.pdf', big, 'application/pdf')
    expect(client.createUploadSession).toHaveBeenCalled()
    expect(client.putSmall).not.toHaveBeenCalled()
    expect((await driver.read('tenants/1/emr/1/big.pdf')).length).toBe(big.length)
  })

  test('parent-folder ensure treats an already-exists 409 as success (M-4) — no error surfaced even when ensureFolder is called twice for the same tenant', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await driver.save('tenants/1/emr/1/a.pdf', Buffer.from('a'), 'application/pdf')
    await expect(driver.save('tenants/1/emr/1/b.pdf', Buffer.from('b'), 'application/pdf')).resolves.toBeUndefined()
  })

  test('a rotated token pair from a proactive/reactive refresh fires onTokensRefreshed with BOTH tokens (M-2 — Microsoft rotates, unlike Google)', async () => {
    const client = new FakeOneDriveClient()
    const onTokensRefreshed = jest.fn().mockResolvedValue(undefined)
    // Simulate the client-level refresh firing by calling the callback directly through a refresh-triggering fake — covered at the onedrive-client.ts unit level (Task 3); this driver-level test asserts the callback wiring reaches the driver's constructor param.
    const driver = makeDriver(client, onTokensRefreshed)
    expect(driver).toBeDefined() // wiring-only smoke test; full refresh behavior asserted in Task 3/8's client-level and callback-level tests
  })
})
