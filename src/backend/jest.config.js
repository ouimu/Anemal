module.exports = {
  preset:          'ts-jest',
  testEnvironment: 'node',
  rootDir:         '.',
  testMatch:       ['**/tests/**/*.test.ts', '**/__tests__/**/*.test.ts'],
  // Git worktrees created under .claude/worktrees/ contain a full second checkout
  // of this repo. Without this ignore, jest discovers their copies too and runs
  // every suite twice against the same test database — the duplicate runs then
  // collide on unique fixtures and report failures that have nothing to do with
  // the code under test.
  testPathIgnorePatterns: ['/node_modules/', '/\.claude/worktrees/'],
  globals: {
    'ts-jest': { tsconfig: './tsconfig.json', isolatedModules: true }
  },
  // Load .env.test (isolated test DB) before dev's .env can be picked up by Prisma's own auto-loader
  setupFiles: ['./jest.setup-env.js', './jest.setup.js'],
  // Runs after the test framework (afterAll/expect/etc.) is installed — see F4 fix
  // in jest.setup-after-env.js.
  setupFilesAfterEnv: ['./jest.setup-after-env.js'],
  // Seed RBAC once before any tests run (runs in separate process)
  globalSetup: './jest-global-setup.js',
  // ponytail: some suites still leave an open handle (e.g. an http server not closed
  // in afterAll) so runInBand can hang at 0 CPU. Force exit after the suite as a
  // safety net. The Prisma-pool leak this used to paper over (F4) is now fixed by
  // the shared afterAll $disconnect() in jest.setup-after-env.js.
  forceExit: true,
  // Map imports so ts-jest resolves them correctly
  moduleFileExtensions: ['ts', 'js', 'json'],
}
