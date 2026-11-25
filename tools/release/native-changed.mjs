// Decides whether a push needs a NEW native build (store or preview binary), or whether an over-the-air update is enough.
//
//   node tools/release/native-changed.mjs <before-sha> <after-sha>
//
// Prints the list of files that can change the native app and `changed=true|false`; when run in GitHub Actions it also
// writes `changed=` to $GITHUB_OUTPUT. The runtime version uses the `fingerprint` policy (app.config.ts), so a build and
// an update only meet when the native code is the same: an OTA update made after a native change reaches nobody until a
// build with that fingerprint exists. This file is the cheap, conservative guess that starts that build. It builds a
// little too often rather than too rarely, and a person can always run "EAS Build" by hand (.github/workflows/eas-build.yml).
//
// Not a replacement for the fingerprint itself: `npx @expo/fingerprint` hashes the real native inputs.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Paths whose change can alter the native binary. */
export const NATIVE_PATTERNS = [
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^app\.config\.ts$/,
  /^app\.json$/,
  /^eas\.json$/,
  /^plugins\//,
  /^patches\//,
  /^(\.fingerprintignore|fingerprint\.config\.js)$/,
  // the app icon, the adaptive icon and the splash image are baked into the binary
  /^assets\/(icon|adaptive|splash)[^/]*$/,
  /^assets\/(app-icons|native)\//,
  // the backend packages are linked by path: a new native dependency there arrives through the app's lockfile, not here
];

export function nativeFiles(files) {
  return files.filter((f) => NATIVE_PATTERNS.some((p) => p.test(f)));
}

const ZERO = /^0+$/;

/** The files changed between two commits, or null when that cannot be known (a new branch, a force push). */
export function changedFiles(before, after, run = defaultRun) {
  if (!before || ZERO.test(before)) return null;
  try {
    return run(['diff', '--name-only', `${before}`, `${after}`])
      .split('\n')
      .filter(Boolean);
  } catch {
    return null;
  }
}

function defaultRun(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

export function decide(before, after, run) {
  const files = changedFiles(before, after, run);
  // Unknown history: assume yes, the safe side.
  if (files === null) return { changed: true, files: [], reason: 'history unknown' };
  const native = nativeFiles(files);
  return {
    changed: native.length > 0,
    files: native,
    reason: native.length ? 'native files changed' : 'JavaScript only',
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [before, after = 'HEAD'] = process.argv.slice(2);
  const result = decide(before, after);
  console.log(`native-changed: ${result.reason}`);
  for (const f of result.files) console.log(`  ${f}`);
  console.log(`changed=${result.changed}`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
}
