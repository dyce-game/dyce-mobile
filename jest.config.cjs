/** @type {import('jest').Config} */
// Pure-logic tests only (API client, session store, chat logic, routing). Component tests (jest-expo + RNTL)
// come with the first screens that need them.
const backend = '<rootDir>/../dyce-backend/packages';

module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      { jsc: { target: 'es2022', parser: { syntax: 'typescript' } }, module: { type: 'commonjs' } },
    ],
  },
  // The linked backend packages are ESM with a dist build; in tests we run their TypeScript source.
  moduleNameMapper: {
    '\.(webp|png|jpe?g)$': '<rootDir>/test/asset-stub.cjs',
    '^@dyce/shared$': `${backend}/shared/src/index.ts`,
    '^@dyce/games$': `${backend}/games/src/index.ts`,
  },
  // Packages imported by that linked source (zod, libphonenumber-js) come from THIS project's node_modules.
  modulePaths: ['<rootDir>/node_modules'],
  testMatch: ['<rootDir>/src/**/*.test.ts'],
};
