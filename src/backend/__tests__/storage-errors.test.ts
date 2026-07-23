// src/backend/__tests__/storage-errors.test.ts
import { StorageNotFoundError, StorageUnavailableError } from '../config/storage-driver'

describe('storage error types', () => {
  test('StorageNotFoundError is a 404 with a stable code', () => {
    const err = new StorageNotFoundError('tenants/1/photo/pet-1.jpg')
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('STORAGE_FILE_NOT_FOUND')
  })

  test('StorageUnavailableError is a 503 with the retryable Thai copy (grill finding #3 — must not read as data loss)', () => {
    const err = new StorageUnavailableError(new Error('ETIMEDOUT'))
    expect(err.statusCode).toBe(503)
    expect(err.code).toBe('STORAGE_UNAVAILABLE')
    expect(err.message).toBe('เข้าถึงที่เก็บไฟล์ไม่ได้ตอนนี้ ลองใหม่อีกครั้ง')
  })
})
