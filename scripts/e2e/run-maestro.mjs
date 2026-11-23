// Runs the Maestro flows in e2e/ against the private dev stack on an emulator, simulator or device.
//
//   node scripts/e2e/run-maestro.mjs                      # every numbered flow, in order
//   node scripts/e2e/run-maestro.mjs e2e/04-qr-pay.yaml   # chosen flows
//   node scripts/e2e/run-maestro.mjs --tag money          # flows whose `tags` include money
//   node scripts/e2e/run-maestro.mjs --dry-run            # seed nothing, print the maestro commands
//   --device <id>        passed to maestro as --device (an adb serial or a simulator UDID)
//   --api <url>          the API as THIS computer reaches it (default: the stack's, http://127.0.0.1:3100).
//                        The app on an Android emulator reaches the same API at 10.0.2.2 by itself (src/lib/config.ts).
//
// For each flow it seeds a fresh world (alice, ben, ... see scripts/seed/seed.mjs), waits out the 30 s per-number
// login-code limit, and runs `maestro test -e KEY=VALUE ... flow.yaml`, writing JUnit to e2e/.artifacts/maestro/.
// Maestro runs on this computer, so the scripts that play "Ben" call the API from here.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlow } from './web-runner.mjs';
import { seedWorld, waitForLoginCooldown, worldEnv } from './world.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const args = process.argv.slice(2);
const flag = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const dry = args.includes('--dry-run');
const tag = flag('tag');
const device = flag('device');

let files = args.filter((a) => /\.ya?ml$/.test(a)).map((f) => resolve(f));
if (!files.length)
  files = readdirSync(join(root, 'e2e'))
    .filter((f) => /^\d\d.*\.ya?ml$/.test(f))
    .sort()
    .map((f) => join(root, 'e2e', f));
if (tag) files = files.filter((f) => (parseFlow(f).header.tags ?? []).includes(tag));

const maestro = spawnSync('maestro', ['--version'], { encoding: 'utf8', shell: true });
const have = maestro.status === 0;
if (!have && !dry) {
  console.error(
    'Maestro is not installed (maestro --version failed).\n' +
      'Install it (https://docs.maestro.dev/getting-started/installing-maestro), boot an emulator or simulator with the\n' +
      'dev build of the app, then run this again. Without Maestro: `node scripts/e2e/lint-flows.mjs` checks the flows and\n' +
      '`node scripts/e2e/web-runner.mjs --all` runs the web-capable ones on the Expo web build.',
  );
  process.exit(2);
}
if (have) console.log(`maestro ${maestro.stdout.trim()}`);

const out = join(root, 'e2e', '.artifacts', 'maestro');
mkdirSync(out, { recursive: true });
const results = [];
for (const file of files) {
  const rel = file.replace(root + '\\', '').replace(root + '/', '');
  let env = { OTP: '424242', API_URL: flag('api') ?? 'http://127.0.0.1:3100' };
  if (!dry) {
    const world = await seedWorld();
    if (flag('api')) world.api = flag('api');
    env = worldEnv(world);
    await waitForLoginCooldown(world);
  }
  const cmd = [
    'test',
    ...(device ? ['--device', device] : []),
    '--format',
    'junit',
    '--output',
    join(out, `${rel.replace(/[\\/]/g, '_')}.xml`),
    ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
    file,
  ];
  if (dry) {
    console.log(
      `maestro ${cmd
        .map((c) => (/[\s=]/.test(c) ? JSON.stringify(c) : c))
        .join(' ')
        .replace(/-e [A-Z_]*TOKEN=\S+/g, '-e TOKEN=<seeded>')}`,
    );
    continue;
  }
  console.log(`\n== ${rel}`);
  const r = spawnSync('maestro', cmd, { stdio: 'inherit', shell: true });
  results.push({ flow: rel, status: r.status === 0 ? 'passed' : 'failed' });
}
if (!dry) {
  console.log('\n=== summary');
  for (const r of results) console.log(`${r.status === 'passed' ? 'PASS' : 'FAIL'}  ${r.flow}`);
  process.exit(results.every((r) => r.status === 'passed') ? 0 : 1);
}
