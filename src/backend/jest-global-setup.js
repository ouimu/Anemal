/**
 * jest-global-setup.js — full DB seed against the isolated test database
 *
 * Runs ONCE before any test suite. Idempotent: uses upsert on all records.
 * Invoked by Jest's globalSetup hook (see jest.config.js).
 *
 * IMPORTANT: This runs in a separate process and must explicitly await seed main()
 * before returning. Jest waits for this to complete before running any tests.
 */

module.exports = async () => {
  // Same override as jest.setup-env.js — this runs in its own process, before setupFiles.
  require('dotenv').config({ path: require('path').join(__dirname, '.env.test'), override: true })

  console.log('[jest-global-setup] Starting full seed (tenants, RBAC, users, branches)...')
  try {
    const { main: seedMain } = require('./prisma/seed')
    await seedMain()
    console.log('[jest-global-setup] Seed complete.')
  } catch (err) {
    console.error('[jest-global-setup] seed failed:', err)
    process.exit(1)
  }
}
