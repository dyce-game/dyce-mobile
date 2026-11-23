// Fails (exit 1) if the release configuration drifts into something a store review, a secret scan or a rollback
// would catch late. Runs in CI and locally:  pnpm release:check
//
// It evaluates app.config.ts once per variant (Node strips the types) and reads eas.json and package.json.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => JSON.parse(readFileSync(resolve(root, f), 'utf8'));
const eas = read('eas.json');
const pkg = read('package.json');
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const problems = [];
const check = (ok, msg) => ok || problems.push(msg);

/** app.config.ts as Expo would see it for one variant, evaluated in a fresh process. */
function appConfig(appEnv) {
  const script = `
    const m = await import(${JSON.stringify(pathToFileURL(resolve(root, 'app.config.ts')).href)});
    console.log(JSON.stringify(m.default({ config: {} })));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, APP_ENV: appEnv, EAS_PROJECT_ID: 'check-project-id' },
  });
  if (r.status !== 0) throw new Error(`app.config.ts failed for ${appEnv}: ${r.stderr}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

// --- eas.json ----------------------------------------------------------------------------------------------
for (const name of ['development', 'preview', 'production']) {
  const p = eas.build?.[name];
  check(p, `eas.json: build profile "${name}" is missing`);
  if (!p) continue;
  check(
    p.channel === name,
    `eas.json: ${name}.channel must be "${name}" (OTA updates are routed by channel)`,
  );
  check(
    p.environment === name,
    `eas.json: ${name}.environment must be "${name}" (EAS environment variables)`,
  );
  check(p.env?.APP_ENV === name, `eas.json: ${name}.env.APP_ENV must be "${name}"`);
  for (const [k, v] of Object.entries(p.env ?? {})) {
    check(
      !/(SECRET|TOKEN|PASSWORD|PRIVATE|AUTH_)/i.test(k) || /^SENTRY_DISABLE/.test(k),
      `eas.json: ${name}.env.${k} looks like a secret; use "eas env:create" instead`,
    );
    check(
      !/(sentry|posthog)/i.test(k) || /^SENTRY_DISABLE/.test(k),
      `eas.json: ${name}.env.${k}: DSN and keys live in EAS environment variables, not in git`,
    );
    check(typeof v === 'string', `eas.json: ${name}.env.${k} must be a string`);
  }
}
const prod = eas.build?.production;
if (prod) {
  check(prod.autoIncrement === true, 'eas.json: production must autoIncrement the build number');
  check(
    /^https:\/\//.test(prod.env?.EXPO_PUBLIC_API_URL ?? ''),
    'eas.json: production API URL must be https',
  );
  check(
    /^wss:\/\//.test(prod.env?.EXPO_PUBLIC_GAME_SERVER_URL ?? ''),
    'eas.json: production game server URL must be wss',
  );
  check(
    !/staging|localhost/.test(JSON.stringify(prod.env)),
    'eas.json: production points at a staging or local URL',
  );
}
check(
  eas.cli?.appVersionSource === 'remote',
  'eas.json: appVersionSource must be "remote" so EAS owns build numbers',
);
check(eas.submit?.production, 'eas.json: submit.production is missing');

// --- app.config.ts per variant ----------------------------------------------------------------------------------
const cfg = Object.fromEntries(
  ['development', 'preview', 'production'].map((e) => [e, appConfig(e)]),
);
for (const [env, c] of Object.entries(cfg)) {
  check(
    c.ios.bundleIdentifier === c.android.package,
    `app.config ${env}: iOS bundle id and Android package differ`,
  );
  check(
    c.runtimeVersion?.policy === 'fingerprint',
    `app.config ${env}: runtimeVersion must use the fingerprint policy`,
  );
  check(c.extra.appEnv === env, `app.config ${env}: extra.appEnv is wrong`);
  check(
    c.updates?.url?.startsWith('https://u.expo.dev/'),
    `app.config ${env}: updates.url is not set when EAS_PROJECT_ID is`,
  );
}
check(
  cfg.production.ios.bundleIdentifier === 'games.dyce.app',
  'app.config: production bundle id changed (a store identity cannot change after release)',
);
check(
  new Set(Object.values(cfg).map((c) => c.ios.bundleIdentifier)).size === 3,
  'app.config: variants must have distinct ids',
);
check(
  cfg.production.ios.associatedDomains?.length > 0,
  'app.config: production must claim the dyce.games universal links',
);
check(
  !cfg.preview.ios.associatedDomains && !cfg.development.ios.associatedDomains,
  'app.config: only production may claim the dyce.games domain',
);
check(
  cfg.production.updates?.enabled === true && cfg.development.updates?.enabled === false,
  'app.config: OTA updates must be on in production and off in development',
);
check(
  cfg.production.ios.config?.usesNonExemptEncryption === false,
  'app.config: export compliance flag missing',
);

// A declared permission must have the library that uses it: the stores (and the privacy answers) read these.
const needs = [
  ['NSCameraUsageDescription', 'expo-camera'],
  ['NSMicrophoneUsageDescription', 'expo-audio'],
  ['NSPhotoLibraryUsageDescription', 'expo-image-picker'],
  ['NSFaceIDUsageDescription', 'expo-local-authentication'],
  ['NSContactsUsageDescription', 'expo-contacts'],
  ['NSMotionUsageDescription', 'expo-sensors'],
];
const androidNeeds = [
  ['CAMERA', 'expo-camera'],
  ['RECORD_AUDIO', 'expo-audio'],
  ['USE_BIOMETRIC', 'expo-local-authentication'],
  ['READ_CONTACTS', 'expo-contacts'],
];
const p = cfg.production;
for (const [key, lib] of needs) {
  if (p.ios.infoPlist?.[key])
    check(
      deps[lib] || (lib === 'expo-audio' && deps['expo-av']),
      `app.config: ${key} is declared but ${lib} is not installed (unused permission)`,
    );
}
for (const [perm, lib] of androidNeeds) {
  if (p.android.permissions?.includes(perm))
    check(
      deps[lib] || (lib === 'expo-audio' && deps['expo-av']),
      `app.config: Android ${perm} is declared but ${lib} is not installed (unused permission)`,
    );
}
for (const key of ['NSContactsUsageDescription', 'NSMotionUsageDescription']) {
  check((p.ios.infoPlist?.[key] ?? '').length > 20, `app.config: ${key} needs a real sentence`);
}

if (problems.length > 0) {
  console.error(
    `release config: ${problems.length} problem(s)\n` + problems.map((m) => `  - ${m}`).join('\n'),
  );
  process.exit(1);
}
console.log('release config: OK (eas.json profiles, app.config variants, permissions)');
