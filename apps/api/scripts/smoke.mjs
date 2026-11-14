// Boots the BUILT api (dist/main.js) against a throwaway embedded PostgreSQL and checks /health.
// Run `pnpm -F @dyce/api build` first. Used in CI after the build step.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../db/migrator.ts';

const dataDir = await mkdtemp(join(tmpdir(), 'dyce-smoke-'));
const pgPort = 55000 + Math.floor(Math.random() * 500);
const apiPort = 56000 + Math.floor(Math.random() * 500);
const db = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: pgPort,
  persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: () => {},
});

let api;
let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`SMOKE FAIL: ${msg}`);
};

try {
  await db.initialise();
  await db.start();
  await db.createDatabase('dyce');
  const admin = new pg.Pool({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${pgPort}/dyce`,
  });
  await migrate(admin);
  await admin.query(`CREATE ROLE dyce_app LOGIN PASSWORD 'dyce_app' IN ROLE dyce_api`);
  await admin.end();

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(apiPort),
    DATABASE_URL: `postgres://dyce_app:dyce_app@127.0.0.1:${pgPort}/dyce`,
    JWT_SECRET: 'x'.repeat(40),
    PHONE_HASH_SALT: 'y'.repeat(40),
  };

  // 1) missing config must stop the app before it listens
  const bad = spawn(process.execPath, ['dist/main.js'], {
    env: { ...env, JWT_SECRET: 'short' },
    stdio: 'pipe',
  });
  const badCode = await new Promise((resolve) => bad.on('exit', resolve));
  if (badCode === 0) fail('app started with an invalid JWT_SECRET');

  // 2) healthy boot
  api = spawn(process.execPath, ['dist/main.js'], { env, stdio: 'pipe' });
  let logs = '';
  api.stdout.on('data', (d) => (logs += d));
  api.stderr.on('data', (d) => (logs += d));

  let body;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${apiPort}/health`);
      body = { status: res.status, json: await res.json() };
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!body) fail(`api never answered. logs:\n${logs}`);
  else if (body.status !== 200 || body.json.status !== 'ok' || body.json.db !== 'up') {
    fail(`unexpected /health response: ${JSON.stringify(body)}`);
  } else {
    console.log(`SMOKE OK: GET /health -> ${JSON.stringify(body.json)}`);
  }
} finally {
  api?.kill();
  await db.stop().catch(() => undefined);
  await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
}
process.exit(failed ? 1 : 0);
