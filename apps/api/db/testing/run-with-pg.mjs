// Runs the DB test project against a real PostgreSQL.
//  - If TEST_DATABASE_ADMIN_URL is set (CI service container, docker compose), uses it.
//  - Otherwise starts a throwaway embedded PostgreSQL (no Docker needed) and stops it afterwards.
// Each test file creates its own database, so files can run in parallel.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// jest's `exports` map hides bin/, so locate it via package.json.
const jestBin = join(dirname(require.resolve('jest/package.json')), 'bin', 'jest.js');
const extraArgs = process.argv.slice(2);

let embedded;
let dataDir;
let adminUrl = process.env.TEST_DATABASE_ADMIN_URL;

if (!adminUrl) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  dataDir = await mkdtemp(join(tmpdir(), 'dyce-pg-'));
  const port = 54000 + Math.floor(Math.random() * 900);
  embedded = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-c', 'max_connections=200', '-c', 'fsync=off'],
    // Server/initdb chatter is dropped. Do NOT lower log_min_messages: embedded-postgres waits
    // for the "ready to accept connections" log line to know the server is up.
    onLog: () => {},
    onError: (msg) => {
      if (process.env.DEBUG_PG) console.error(String(msg));
    },
  });
  await embedded.initialise();
  await embedded.start();
  adminUrl = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  console.log(`[db tests] embedded PostgreSQL on port ${port}`);
}

const code = await new Promise((resolve) => {
  const child = spawn(
    process.execPath,
    [jestBin, '--selectProjects', 'db', '--runInBand', ...extraArgs],
    { stdio: 'inherit', env: { ...process.env, TEST_DATABASE_ADMIN_URL: adminUrl } },
  );
  child.on('exit', (c) => resolve(c ?? 1));
});

if (embedded) {
  await embedded.stop().catch(() => undefined);
  await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
}
process.exit(code);
