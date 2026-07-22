import fs from 'fs'
import os from 'os'
import path from 'path'
import { LocalDiskDriver } from '../config/storage-driver'

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
})
