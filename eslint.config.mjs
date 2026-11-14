import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Flat config shared by every workspace. Type-aware rules are intentionally off for speed;
// `pnpm typecheck` is the type gate.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.expo/**',
      'design/**',
      'assets/**',
      '**/*.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      // Money is integer kobo: floats and Math.random have no place in game/money code.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'Use the seeded RNG from @dyce/games (rng.ts). Engines must be deterministic.',
        },
      ],
    },
  },
  {
    // Tests, scripts and the app shell may use Math.random / Date freely.
    files: ['**/*.test.ts', '**/scripts/**', '**/db/testing/**', 'apps/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
);
