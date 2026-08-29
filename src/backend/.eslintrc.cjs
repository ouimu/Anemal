module.exports = {
  root: true,
  env: { node: true, es2020: true, jest: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: [
    'dist',
    'node_modules',
    '.claude/worktrees',
    'prisma/migrations',
    '.eslintrc.cjs',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    'no-unused-vars': 'off',
  },
  overrides: [
    {
      // Tests commonly need `any` for mock payloads and `require()` for
      // jest.mock/jest.resetModules-driven dynamic imports — production code
      // (§3 of anemal-coding-rules) stays strict, tests stay pragmatic.
      files: ['**/*.test.ts', '__tests__/**/*.ts', 'tests/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
  ],
};
