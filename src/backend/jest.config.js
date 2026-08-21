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
  // Seed RBAC once before any tests run (runs in separate process)
  globalSetup: './jest-global-setup.js',
  // ponytail: tests leak an open handle (Prisma pool not disconnected) so runInBand
  // never exits and the run hangs at 0 CPU. Force exit after the suite. Upgrade path:
  // add afterAll(() => prisma.$disconnect()) in jest.setup.js, then drop forceExit.
  forceExit: true,
  // Map imports so ts-jest resolves them correctly
  moduleFileExtensions: ['ts', 'js', 'json'],
}
