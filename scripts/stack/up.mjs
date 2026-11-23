// A private Dyce dev stack for QA runs: a throwaway embedded PostgreSQL, the API and the game server,
// on their own ports, so e2e flows and load tests never touch (or get disturbed by) the shared dev stack.
//
//   node scripts/stack/up.mjs                       # build the API into dist/qa, start everything
//   node scripts/stack/up.mjs --no-build            # reuse the last dist/qa
//   node scripts/stack/up.mjs --public-host 10.0.2.2   # for an Android emulator (live rooms)
//   node scripts/stack/up.mjs --api-port 3100 --game-port 2667 --pg-port 54380
//   node scripts/stack/up.mjs --data C:\some\dir    # keep the database between runs (default: throwaway)
//
// It prints the URLs, writes them to <tmp>/dyce-qa-stack.json (read by the seed, load and walk scripts) and
// runs until Ctrl+C. The OTP test code is 424242 (non-production only). Nothing here is used in production.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backend = resolve(process.env.DYCE_BACKEND ?? join(here, '..', '..', '..', 'dyce-backend'));
const apiDir = join(backend, 'apps', 'api');
const gameDir = join(backend, 'apps', 'game-server');

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? def) : def;
};
const has = (name) => args.includes(`--${name}`);

export const STACK_FILE = join(tmpdir(), 'dyce-qa-stack.json');
const pgPort = Number(flag('pg-port', 54380));
const apiPort = Number(flag('api-port', 3100));
const gamePort = Number(flag('game-port', 2667));
const webOrigin = flag('web-origin', 'http://localhost:8090');
// The address the apps are told to use for live rooms. 127.0.0.1 is right for the web build and an iOS simulator; an
// Android emulator reaches this computer at 10.0.2.2 (a phone: this computer's LAN address).
const publicHost = flag('public-host', '127.0.0.1');
const keepDir = flag('data', null);
const OTP = '424242';
const JWT_SECRET = 'qa-jwt-secret-'.padEnd(48, 'j');
const INTERNAL_SECRET = 'qa-internal-secret-'.padEnd(48, 'i');

if (!existsSync(join(apiDir, 'package.json'))) {
  console.error(`dyce-backend not found at ${backend} (set DYCE_BACKEND)`);
  process.exit(1);
}

const tsc = join(backend, 'node_modules', 'typescript', 'bin', 'tsc');
if (!has('no-build')) {
  // dist/qa is gitignored (dist/), so this never shows up as a change in the backend repo.
  console.log('building the API into apps/api/dist/qa ...');
  const r = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json', '--outDir', 'dist/qa'], {
    cwd: apiDir,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error('API build failed (someone may be mid-edit): fix or rerun with --no-build');
    process.exit(1);
  }
}
const apiMain = join(apiDir, 'dist', 'qa', 'main.js');
const gameMain = join(gameDir, 'dist', 'main.js');
for (const f of [apiMain, gameMain]) {
  if (!existsSync(f)) {
    console.error(`missing ${f}: build it first (pnpm -F @dyce/game-server build)`);
    process.exit(1);
  }
}

const req = createRequire(join(apiDir, 'package.json'));
const EmbeddedPostgres = req('embedded-postgres').default ?? req('embedded-postgres');
const pg = req('pg');
process.chdir(apiDir); // the migrator reads db/migrations relative to the API
const { migrate } = await import(pathToFileURL(join(apiDir, 'db', 'migrator.ts')).href);

const dataDir = keepDir ? resolve(keepDir) : mkdtempSync(join(tmpdir(), 'dyce-qa-pg-'));
const fresh = !existsSync(join(dataDir, 'PG_VERSION'));
const db = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: pgPort,
  persistent: Boolean(keepDir),
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: () => {},
});
if (fresh) await db.initialise();
await db.start();
if (fresh) await db.createDatabase('dyce');
const admin = new pg.Pool({
  connectionString: `postgres://postgres:postgres@127.0.0.1:${pgPort}/dyce`,
});
const { applied } = await migrate(admin);
await admin.query(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dyce_app') THEN
    CREATE ROLE dyce_app LOGIN PASSWORD 'dyce_app' IN ROLE dyce_api;
  END IF; END $$`);
await admin.end();
console.log(`database ready on :${pgPort} (${applied.length} migrations applied)`);

const dbUrl = `postgres://dyce_app:dyce_app@127.0.0.1:${pgPort}/dyce`;
const procs = [];
const pids = {};
const logs = { api: '', game: '' };
const run = (name, cwd, main, env) => {
  const p = spawn(process.execPath, [main], {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'pipe',
  });
  p.stdout.on('data', (d) => (logs[name] = (logs[name] + d).slice(-20000)));
  p.stderr.on('data', (d) => (logs[name] = (logs[name] + d).slice(-20000)));
  p.on('exit', (code) => console.log(`${name} exited with ${code}`));
  procs.push(p);
  pids[name] = p.pid;
};
run('game', gameDir, gameMain, {
  PORT: String(gamePort),
  DATABASE_URL: dbUrl,
  JWT_SECRET,
  INTERNAL_SECRET,
});
run('api', apiDir, apiMain, {
  NODE_ENV: 'development',
  PORT: String(apiPort),
  DATABASE_URL: dbUrl,
  JWT_SECRET,
  PHONE_HASH_SALT: 'qa-phone-salt-'.padEnd(48, 'p'),
  JWT_ACCESS_TTL_SECONDS: '86400',
  OTP_TEST_CODE: OTP,
  SMS_DRIVER: 'console',
  PUSH_DRIVER: 'console',
  INTERNAL_SECRET,
  GAME_SERVER_URL: `http://127.0.0.1:${gamePort}`,
  GAME_SERVER_PUBLIC_URL: `ws://${publicHost}:${gamePort}`,
  CORS_ORIGINS: [webOrigin, webOrigin.replace('localhost', '127.0.0.1')].join(','),
  INVITE_BASE_URL: webOrigin,
  TRUST_PROXY_HOPS: '1', // load tests send X-Forwarded-For so each simulated user has its own rate-limit bucket
});

const up = async (url) => {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};
const okApi = await up(`http://127.0.0.1:${apiPort}/health`);
const okGame = await up(`http://127.0.0.1:${gamePort}/health`);
if (!okApi || !okGame) {
  console.error(
    'a server did not come up.\n--- api ---\n' + logs.api + '\n--- game ---\n' + logs.game,
  );
  await stop(1);
}

const info = {
  api: `http://127.0.0.1:${apiPort}`,
  game: `ws://127.0.0.1:${gamePort}`,
  gameHttp: `http://127.0.0.1:${gamePort}`,
  db: `postgres://postgres:postgres@127.0.0.1:${pgPort}/dyce`,
  otp: OTP,
  webOrigin,
  pid: process.pid,
  apiPid: pids.api,
  gamePid: pids.game,
  dbPid: Number(readFileSync(join(dataDir, 'postmaster.pid'), 'utf8').split(/\r?\n/)[0]) || null,
};
writeFileSync(STACK_FILE, JSON.stringify(info, null, 2));
console.log(
  `api  ${info.api}\ngame ${info.game}\notp  ${OTP}\nstate file ${STACK_FILE}\nCtrl+C to stop.`,
);

async function stop(code = 0) {
  for (const p of procs) p.kill();
  await db.stop().catch(() => undefined);
  if (!keepDir) rmSync(dataDir, { recursive: true, force: true });
  rmSync(STACK_FILE, { force: true });
  process.exit(code);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
