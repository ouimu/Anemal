/**
 * jest-global-setup.js — Phase 8 (T-5B) RBAC seeding
 *
 * Runs ONCE before any test suite. Idempotent: uses upsert on all records.
 * Invoked by Jest's globalSetup hook (see jest.config.js).
 *
 * IMPORTANT: This runs in a separate process and must explicitly await seedRbac()
 * before returning. Jest waits for this to complete before running any tests.
 */

module.exports = async () => {
  console.log('[jest-global-setup] Starting RBAC seed...')
  try {
    const { seedRbac } = require('./prisma/seed-rbac')
    await seedRbac()
    console.log('[jest-global-setup] RBAC seed complete.')
  } catch (err) {
    console.error('[jest-global-setup] seedRbac failed:', err)
    process.exit(1)
  }
}
