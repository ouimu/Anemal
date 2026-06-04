module.exports = {
  preset:          'ts-jest',
  testEnvironment: 'node',
  rootDir:         '.',
  testMatch:       ['**/tests/**/*.test.ts', '**/__tests__/**/*.test.ts'],
  globals: {
    'ts-jest': { tsconfig: './tsconfig.json' }
  },
  // Ensure dotenv is loaded before tests
  setupFiles: ['dotenv/config', './jest.setup.js'],
  // Map imports so ts-jest resolves them correctly
  moduleFileExtensions: ['ts', 'js', 'json'],
}
