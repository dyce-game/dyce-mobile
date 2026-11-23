// EAS Build hook ("eas-build-pre-install" in package.json).
//
// The app links @dyce/shared and @dyce/games from the sibling repo (`link:../dyce-backend/packages/*`, ADR-011), but EAS
// Build uploads only THIS repository, so `pnpm install` would fail on a missing folder. This hook puts the backend
// packages next to the project before the install runs.
//
// Secrets and settings come from the EAS environment (never from the repo):
//   BACKEND_REPO         owner/name of the backend repository       (default: dyce-game/dyce-backend)
//   BACKEND_REF          branch, tag or commit to build against     (production builds MUST pin a commit or tag)
//   BACKEND_REPO_TOKEN   read-only token if the repository is private (an EAS secret)
//
// Outside EAS (your laptop, CI where the sibling is already checked out) it does nothing.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = resolve(root, '..', 'dyce-backend');

if (existsSync(join(target, 'packages', 'shared', 'package.json'))) {
  console.log(`fetch-backend: ${target} already present, nothing to do`);
  process.exit(0);
}
if (!process.env.EAS_BUILD) {
  console.error(
    `fetch-backend: ${target} is missing. Check out dyce-backend next to this repo (CLAUDE.md "Two repositories").`,
  );
  process.exit(1);
}

const repo = process.env.BACKEND_REPO ?? 'dyce-game/dyce-backend';
const ref = process.env.BACKEND_REF;
const profile = process.env.EAS_BUILD_PROFILE ?? '';
if (!ref && profile === 'production') {
  console.error(
    'fetch-backend: BACKEND_REF (a commit or tag) is required for production builds, so they are reproducible.',
  );
  process.exit(1);
}
const token = process.env.BACKEND_REPO_TOKEN;
const url = token
  ? `https://x-access-token:${token}@github.com/${repo}.git`
  : `https://github.com/${repo}.git`;

const git = (args, opts = {}) => execFileSync('git', args, { stdio: 'inherit', ...opts });
console.log(`fetch-backend: cloning ${repo} @ ${ref ?? 'default branch'} into ${target}`);
try {
  git(['init', '--quiet', target]);
  git(['-C', target, 'fetch', '--quiet', '--depth', '1', url, ref ?? 'HEAD']);
  git(['-C', target, 'checkout', '--quiet', 'FETCH_HEAD']);
} catch {
  // Never echo the URL: it carries the token.
  console.error(
    'fetch-backend: could not fetch the backend repository (check BACKEND_REPO, BACKEND_REF, BACKEND_REPO_TOKEN)',
  );
  process.exit(1);
}
console.log('fetch-backend: done');
