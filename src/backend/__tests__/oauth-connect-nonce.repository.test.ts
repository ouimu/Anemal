// src/backend/__tests__/oauth-connect-nonce.repository.test.ts
// Real-DB test (Prisma against the test Postgres instance) — the
// grill-N-3 guarantee is a DB-level atomic UPDATE, not something a mocked
// Prisma client can prove.
import prisma from '../config/db'
import { createNonce, consumeNonce } from '../models/oauth-connect-nonce.repository'

const TENANT_ID = 900001
const USER_ID = 1

afterEach(async () => {
  await prisma.oAuthConnectNonce.deleteMany({ where: { tenantId: TENANT_ID } })
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('createNonce / consumeNonce', () => {
  test('a freshly created nonce consumes exactly once', async () => {
    const rawNonce = await createNonce({ tenantId: TENANT_ID, userId: USER_ID, provider: 'google', expiresAt: new Date(Date.now() + 60_000) })
    expect(await consumeNonce(rawNonce, 'google')).toBe(true)
  })

  test('consuming the same nonce twice — the second call fails (grill N-3: replay rejected)', async () => {
    const rawNonce = await createNonce({ tenantId: TENANT_ID, userId: USER_ID, provider: 'google', expiresAt: new Date(Date.now() + 60_000) })
    expect(await consumeNonce(rawNonce, 'google')).toBe(true)
    expect(await consumeNonce(rawNonce, 'google')).toBe(false)
  })

  test('consuming a nonce that was never created fails', async () => {
    expect(await consumeNonce('never-existed-nonce', 'google')).toBe(false)
  })

  test('two concurrent consume attempts on the same nonce — exactly one succeeds (grill N-3: atomic single statement, not verify-then-mark)', async () => {
    const rawNonce = await createNonce({ tenantId: TENANT_ID, userId: USER_ID, provider: 'google', expiresAt: new Date(Date.now() + 60_000) })
    const [first, second] = await Promise.all([consumeNonce(rawNonce, 'google'), consumeNonce(rawNonce, 'google')])
    const successCount = [first, second].filter(Boolean).length
    expect(successCount).toBe(1)
  })

  test('the raw nonce is never stored in plaintext — only its hash', async () => {
    const rawNonce = await createNonce({ tenantId: TENANT_ID, userId: USER_ID, provider: 'google', expiresAt: new Date(Date.now() + 60_000) })
    const row = await prisma.oAuthConnectNonce.findFirst({ where: { tenantId: TENANT_ID } })
    expect(row?.nonceHash).not.toBe(rawNonce)
    expect(row?.nonceHash).toHaveLength(64) // sha256 hex
  })
})

describe('consumeNonce — provider-matched consume (M-7)', () => {
  test('a nonce minted for "google" consumes successfully when presented with provider="google" (non-regression, BA F-OD-2)', async () => {
    const rawNonce = await createNonce({ tenantId: TENANT_ID, userId: USER_ID, provider: 'google', expiresAt: new Date(Date.now() + 600_000) })
    await expect(consumeNonce(rawNonce, 'google')).resolves.toBe(true)
  })

  test('a nonce minted for "google" is REJECTED when presented with provider="onedrive" (the one genuinely new security test, M-7)', async () => {
    const rawNonce = await createNonce({ tenantId: TENANT_ID, userId: USER_ID, provider: 'google', expiresAt: new Date(Date.now() + 600_000) })
    await expect(consumeNonce(rawNonce, 'onedrive')).resolves.toBe(false)
  })

  test('a nonce minted for "onedrive" is REJECTED when presented with provider="google" (both directions)', async () => {
    const rawNonce = await createNonce({ tenantId: TENANT_ID, userId: USER_ID, provider: 'onedrive', expiresAt: new Date(Date.now() + 600_000) })
    await expect(consumeNonce(rawNonce, 'google')).resolves.toBe(false)
  })

  test('a nonce minted for "onedrive" consumes successfully when presented with provider="onedrive"', async () => {
    const rawNonce = await createNonce({ tenantId: TENANT_ID, userId: USER_ID, provider: 'onedrive', expiresAt: new Date(Date.now() + 600_000) })
    await expect(consumeNonce(rawNonce, 'onedrive')).resolves.toBe(true)
  })

  test('still single-use within the same provider (existing N-3 guarantee unaffected)', async () => {
    const rawNonce = await createNonce({ tenantId: TENANT_ID, userId: USER_ID, provider: 'google', expiresAt: new Date(Date.now() + 600_000) })
    expect(await consumeNonce(rawNonce, 'google')).toBe(true)
    expect(await consumeNonce(rawNonce, 'google')).toBe(false)
  })
})
