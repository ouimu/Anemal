import { GoogleDriveDriver, GoogleDriveFolderIds } from '../config/google-drive-driver'
import { FakeGoogleDriveClient } from './helpers/fakeGoogleDriveClient'
import { StorageNotFoundError, StorageUnavailableError, StorageKeyError } from '../config/storage-driver'
import { GoogleDriveClientConfig } from '../config/google-drive-client'

const credentials = { clientId: 'cid', clientSecret: 'csecret', accessToken: 'at', refreshToken: 'rt' }
const emptyFolderIds: GoogleDriveFolderIds = { rootFolderId: null, emrFolderId: null, photoFolderId: null }

function makeDriver(
  client: FakeGoogleDriveClient,
  folderIds: GoogleDriveFolderIds = emptyFolderIds,
  onFolderIdsResolved: jest.Mock = jest.fn().mockResolvedValue(undefined),
  onAccessTokenRefreshed: jest.Mock = jest.fn().mockResolvedValue(undefined),
) {
  const factory = (config: GoogleDriveClientConfig) => client.bindConfig(config)
  return new GoogleDriveDriver(1, credentials, folderIds, onFolderIdsResolved, onAccessTokenRefreshed, factory)
}

describe('GoogleDriveDriver', () => {
  test('save() then read() round-trips exact bytes, auto-creating the tenant folder tree on first use', async () => {
    const client = new FakeGoogleDriveClient()
    const onFolderIdsResolved = jest.fn().mockResolvedValue(undefined)
    const driver = makeDriver(client, emptyFolderIds, onFolderIdsResolved)
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('img-bytes'), 'image/jpeg')
    const buf = await driver.read('tenants/1/photo/pet-1.jpg')
    expect(buf.toString()).toBe('img-bytes')
    expect(onFolderIdsResolved).toHaveBeenCalledWith(expect.objectContaining({ photoFolderId: expect.any(String) }))
  })

  test('save() on an existing key uses files.update on the SAME file id, not a duplicate files.create (grill finding N-1 — critical, pet-photo replace depends on this)', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('v1'), 'image/jpeg')
    expect((await driver.read('tenants/1/photo/pet-1.jpg')).toString()).toBe('v1')
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('v2-longer'), 'image/jpeg')
    expect((await driver.read('tenants/1/photo/pet-1.jpg')).toString()).toBe('v2-longer')
    expect(client.countFilesNamed('pet-1.jpg')).toBe(1)
  })

  test('emr keys resolve into a per-record subfolder under the tenant emr folder', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    await driver.save('tenants/1/emr/42/report.pdf', Buffer.from('x'), 'application/pdf')
    expect((await driver.read('tenants/1/emr/42/report.pdf')).toString()).toBe('x')
  })

  test('exists() is false before save and true after', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    expect(await driver.exists('tenants/1/photo/never.jpg')).toBe(false)
    await driver.save('tenants/1/photo/never.jpg', Buffer.from('x'), 'image/jpeg')
    expect(await driver.exists('tenants/1/photo/never.jpg')).toBe(true)
  })

  test('read() on a missing key throws StorageNotFoundError, not a raw Drive error', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    await expect(driver.read('tenants/1/photo/ghost.jpg')).rejects.toBeInstanceOf(StorageNotFoundError)
  })

  test('delete() is idempotent on an already-missing key', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    await expect(driver.delete('tenants/1/photo/nothing.jpg')).resolves.toBeUndefined()
  })

  test('a key outside the tenants/{tenantId}/{emr|photo}/... shape throws StorageKeyError', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    await expect(driver.save('not-a-valid-key.txt', Buffer.from('x'), 'text/plain')).rejects.toBeInstanceOf(StorageKeyError)
  })

  test('a key for a different tenant throws StorageKeyError (defense in depth — callers always pass this tenant\'s own keys)', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    await expect(driver.read('tenants/999/photo/pet-1.jpg')).rejects.toBeInstanceOf(StorageKeyError)
  })

  test('a revoked/invalid token surfaces as StorageUnavailableError, not a raw Drive/auth error', async () => {
    const client = new FakeGoogleDriveClient({ failAuthInvalid: true })
    const driver = makeDriver(client)
    await expect(driver.save('tenants/1/photo/a.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toBeInstanceOf(StorageUnavailableError)
  })

  test('a cached folder id Drive no longer recognizes self-heals — re-creates the tree, updates the cache, and the write still succeeds (error handling section: "not fatal")', async () => {
    const client = new FakeGoogleDriveClient()
    const staleFolderIds: GoogleDriveFolderIds = { rootFolderId: 'stale-root', emrFolderId: null, photoFolderId: 'stale-and-deleted-photo-folder' }
    const onFolderIdsResolved = jest.fn().mockResolvedValue(undefined)
    const driver = makeDriver(client, staleFolderIds, onFolderIdsResolved)
    await expect(driver.save('tenants/1/photo/b.jpg', Buffer.from('y'), 'image/jpeg')).resolves.toBeUndefined()
    expect(onFolderIdsResolved).toHaveBeenCalledWith(expect.objectContaining({ photoFolderId: expect.any(String) }))
    expect((await driver.read('tenants/1/photo/b.jpg')).toString()).toBe('y')
  })

  test('a silently-refreshed access token fires onAccessTokenRefreshed with the new token', async () => {
    const client = new FakeGoogleDriveClient({ refreshAccessTokenOnFirstCall: 'new-access-token' })
    const onAccessTokenRefreshed = jest.fn().mockResolvedValue(undefined)
    const driver = makeDriver(client, emptyFolderIds, jest.fn().mockResolvedValue(undefined), onAccessTokenRefreshed)
    await driver.exists('tenants/1/photo/a.jpg')
    expect(onAccessTokenRefreshed).toHaveBeenCalledWith('new-access-token')
  })
})
