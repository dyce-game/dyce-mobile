/** @type {import('jest').Config} */
// Only pure-TS tests live here (tokens, contrast, helpers). Component tests use jest-expo in apps/mobile.
module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.(t|j)sx?$': ['@swc/jest'] },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
};
