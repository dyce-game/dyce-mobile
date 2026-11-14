/** @type {import('jest').Config} */
const transform = {
  '^.+\\.(t|j)sx?$': [
    '@swc/jest',
    { jsc: { target: 'es2022', parser: { syntax: 'typescript', decorators: true } }, module: { type: 'commonjs' } },
  ],
};

module.exports = {
  testTimeout: 60000,
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      transform,
      testMatch: ['<rootDir>/src/**/*.test.ts'],
    },
    {
      // Needs a real PostgreSQL: run via `pnpm test:db` (starts an embedded one if none is configured).
      displayName: 'db',
      testEnvironment: 'node',
      transform,
      testMatch: ['<rootDir>/db/tests/**/*.test.ts'],
    },
  ],
};
