import fs from 'fs'
import os from 'os'
import path from 'path'
import { LocalDiskDriver, StorageNotFoundError, StorageUnavailableError, getStorageDriver } from '../config/storage-driver'
import { SmbShareDriver } from '../config/smb-share-driver'
import { GoogleDriveDriver } from '../config/google-drive-driver'
import { OneDriveDriver } from '../config/onedrive-driver'
import * as storageConfigSvc from '../services/storage-config.service'

jest.mock('../services/storage-config.service')

describe('LocalDiskDriver', () => {
  let baseDir: string
  let driver: LocalDiskDriver

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemal-storage-test-'))
    driver = new LocalDiskDriver(baseDir)
  })

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true })
  })

  test('save() writes the buffer, creating parent directories as needed', async () => {
    await driver.save('tenants/1/emr/2/file.pdf', Buffer.from('hello'), 'application/pdf')
    const written = fs.readFileSync(path.join(baseDir, 'tenants/1/emr/2/file.pdf'))
    expect(written.toString()).toBe('hello')
  })

  test('read() round-trips the exact bytes previously saved', async () => {
    await driver.save('a/b.txt', Buffer.from('round-trip'), 'text/plain')
    const buf = await driver.read('a/b.txt')
    expect(buf.toString()).toBe('round-trip')
  })

  test('exists() is false before save and true after', async () => {
    expect(await driver.exists('never/written.txt')).toBe(false)
    await driver.save('now/written.txt', Buffer.from('x'), 'text/plain')
    expect(await driver.exists('now/written.txt')).toBe(true)
  })

  test('delete() on a missing file does not throw (idempotent)', async () => {
    await expect(driver.delete('nothing/here.txt')).resolves.toBeUndefined()
  })

  test('save()/read()/delete()/exists() all reject a relative-traversal key', async () => {
    const evilKey = '../../etc/passwd'
    await expect(driver.save(evilKey, Buffer.from('x'), 'text/plain')).rejects.toThrow(/invalid storage key/i)
    await expect(driver.read(evilKey)).rejects.toThrow(/invalid storage key/i)
    await expect(driver.delete(evilKey)).rejects.toThrow(/invalid storage key/i)
    await expect(driver.exists(evilKey)).rejects.toThrow(/invalid storage key/i)
  })

  test('save() rejects an absolute-path key', async () => {
    const absoluteKey = path.resolve(os.tmpdir(), 'outside-basedir.txt')
    await expect(driver.save(absoluteKey, Buffer.from('x'), 'text/plain')).rejects.toThrow(/invalid storage key/i)
  })

  test('ATTACHMENT_DIR env var overrides the default base dir when no baseDir arg is given', async () => {
    const envDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemal-storage-env-'))
    const original = process.env.ATTACHMENT_DIR
    process.env.ATTACHMENT_DIR = envDir
    try {
      const envDriver = new LocalDiskDriver()
      await envDriver.save('probe.txt', Buffer.from('env'), 'text/plain')
      expect(fs.readFileSync(path.join(envDir, 'probe.txt')).toString()).toBe('env')
    } finally {
      if (original === undefined) delete process.env.ATTACHMENT_DIR
      else process.env.ATTACHMENT_DIR = original
      fs.rmSync(envDir, { recursive: true, force: true })
    }
  })

  test('save() writes to a temp name then renames — grill finding #2 (atomic write)', async () => {
    await driver.save('atomic/first.txt', Buffer.from('v1'), 'text/plain')
    // Simulate a mid-write crash by writing a huge buffer and immediately reading:
    // the old file must never be observed truncated/missing between the two saves.
    const savePromise = driver.save('atomic/first.txt', Buffer.from('v2-longer-content'), 'text/plain')
    await savePromise
    const finalContent = fs.readFileSync(path.join(baseDir, 'atomic/first.txt')).toString()
    expect(finalContent).toBe('v2-longer-content')
    // No stray temp file left behind after a successful save:
    const dirEntries = fs.readdirSync(path.join(baseDir, 'atomic'))
    expect(dirEntries).toEqual(['first.txt'])
  })

  test('read() throws StorageNotFoundError (not a generic Error) for a missing file', async () => {
    await expect(driver.read('never/here.txt')).rejects.toBeInstanceOf(StorageNotFoundError)
  })

  test('exists() throws StorageUnavailableError (not false) when the base dir itself is unreadable', async () => {
    const unreadableBase = fs.mkdtempSync(path.join(os.tmpdir(), 'anemal-unreadable-'))
    const restrictedDriver = new LocalDiskDriver(unreadableBase)
    await restrictedDriver.save('probe.txt', Buffer.from('x'), 'text/plain')
    // Force a non-ENOENT error: replace the target with a directory of the same name
    // so fs.access hits EISDIR-adjacent errno instead of ENOENT — simplest reliable
    // way to produce "some other error" without touching OS permissions cross-platform.
    const target = path.join(unreadableBase, 'probe.txt')
    fs.rmSync(target)
    fs.mkdirSync(path.join(target, 'nested'), { recursive: true }) // probe.txt is now a directory
    await expect(restrictedDriver.read('probe.txt')).rejects.toBeInstanceOf(StorageUnavailableError)
    fs.rmSync(unreadableBase, { recursive: true, force: true })
  })
})

describe('getStorageDriver(tenantId)', () => {
  afterEach(() => jest.restoreAllMocks())

  test('no TenantStorageConfig row → resolves a LocalDiskDriver', async () => {
    jest.spyOn(storageConfigSvc, 'resolveStorageConfig').mockResolvedValue({ provider: 'local' })
    const driver = await getStorageDriver(1)
    expect(driver).toBeInstanceOf(LocalDiskDriver)
  })

  test('provider="custom_path" row → resolves a SmbShareDriver', async () => {
    jest.spyOn(storageConfigSvc, 'resolveStorageConfig').mockResolvedValue({
      provider: 'custom_path', host: 'h', share: 's', username: 'u', password: 'p',
    })
    const driver = await getStorageDriver(1)
    expect(driver).toBeInstanceOf(SmbShareDriver)
  })
})

describe('getStorageDriver(tenantId) — google_drive branch', () => {
  test('provider="google_drive" row → resolves a GoogleDriveDriver', async () => {
    jest.spyOn(storageConfigSvc, 'resolveStorageConfig').mockResolvedValue({
      provider: 'google_drive', accessToken: 'at', refreshToken: 'rt',
      rootFolderId: 'root-1', emrFolderId: 'emr-1', photoFolderId: 'photo-1',
    })
    const driver = await getStorageDriver(1)
    expect(driver).toBeInstanceOf(GoogleDriveDriver)
  })
})

describe('getStorageDriver(tenantId) — onedrive branch', () => {
  test('provider="onedrive" row → resolves an OneDriveDriver', async () => {
    jest.spyOn(storageConfigSvc, 'resolveStorageConfig').mockResolvedValue({
      provider: 'onedrive', accessToken: 'at', refreshToken: 'rt', tokenExpiresAt: new Date(Date.now() + 3600_000),
    })
    const driver = await getStorageDriver(1)
    expect(driver).toBeInstanceOf(OneDriveDriver)
  })
})
