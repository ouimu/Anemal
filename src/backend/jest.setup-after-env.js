// F4 fix: each test file gets its own module registry, so every file that imports
// config/db.ts (directly or transitively) instantiates its own PrismaClient with its
// own connection pool. Most test files never call $disconnect() on it, so the pool
// stays open until the whole jest process exits — with runInBand that's dozens of
// leaked pools accumulating within one process across a shard's test files, which is
// what exhausted max_connections=100 around suite 47. Disconnecting the shared
// singleton here runs once per test file regardless of whether that file remembered
// to do it itself; calling $disconnect() on an already-disconnected client is a no-op.
// Needs `afterAll`, which only exists once the test framework is installed — hence
// setupFilesAfterEnv, not setupFiles (see jest.setup.js).
//
// Some unit-test files `jest.mock('../../config/db')` (or mock @prisma/client
// entirely) to avoid touching the database at all — there, requiring config/db
// returns the mock, which may have no real `$disconnect`. Guard for that instead of
// letting the mock dictate whether every other suite's teardown runs.
afterAll(async () => {
  const prisma = require('./config/db').default
  if (prisma && typeof prisma.$disconnect === 'function') {
    await prisma.$disconnect()
  }
})
