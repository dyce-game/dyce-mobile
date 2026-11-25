import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, nativeFiles } from './native-changed.mjs';

const diff = (files) => () => files.join('\n') + '\n';

test('a JavaScript or docs change needs no new build', () => {
  const r = decide(
    'a'.repeat(40),
    'b'.repeat(40),
    diff(['src/features/chat/ChatList.tsx', 'docs/STATUS.md', 'e2e/01.yaml']),
  );
  assert.equal(r.changed, false);
});

test('a dependency, config, eas or icon change needs a build', () => {
  for (const f of [
    'package.json',
    'pnpm-lock.yaml',
    'app.config.ts',
    'eas.json',
    'plugins/with-x.js',
    'assets/icon.png',
    'assets/splash.png',
  ]) {
    assert.equal(decide('a'.repeat(40), 'b'.repeat(40), diff(['src/a.ts', f])).changed, true, f);
  }
});

test('unknown history is treated as a native change (the safe side)', () => {
  assert.equal(decide('0'.repeat(40), 'b'.repeat(40), diff([])).changed, true);
  assert.equal(decide('', 'b'.repeat(40), diff([])).changed, true);
  assert.equal(
    decide('a'.repeat(40), 'b'.repeat(40), () => {
      throw new Error('bad revision');
    }).changed,
    true,
  );
});

test('only exact native paths count', () => {
  assert.deepEqual(
    nativeFiles([
      'src/package.json',
      'docs/app.config.ts',
      'assets/marketing/icon.png',
      'assets/icon.png',
    ]),
    ['assets/icon.png'],
  );
});
