/** @type {import('jest').Config} */
// Pure-logic tests only (API client, session store, routing). Component tests (jest-expo + RNTL) come
// with the first feature screens that need them.
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      { jsc: { target: 'es2022', parser: { syntax: 'typescript' } }, module: { type: 'commonjs' } },
    ],
  },
  moduleNameMapper: {
    '^@dyce/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
};
