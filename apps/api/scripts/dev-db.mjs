// Local development database without Docker: starts an embedded PostgreSQL (data kept in .dev-db/),
// applies migrations, creates the `dyce_app` login role, and stays running until Ctrl+C.
//   pnpm -F @dyce/api db:dev      then      DATABASE_URL=postgres://dyce_app:dyce_app@localhost:54329/dyce
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../db/migrator.ts';

const port = Number(process.env.DEV_DB_PORT ?? 54329);
const dir = join(process.cwd(), '.dev-db');
const fresh = !existsSync(join(dir, 'PG_VERSION'));

const server = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: () => {},
});

if (fresh) await server.initialise();
await server.start();
if (fresh) await server.createDatabase('dyce');

const admin = new pg.Pool({
  connectionString: `postgres://postgres:postgres@127.0.0.1:${port}/dyce`,
});
const { applied } = await migrate(admin);
await admin.query(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dyce_app') THEN
    CREATE ROLE dyce_app LOGIN PASSWORD 'dyce_app' IN ROLE dyce_api;
  END IF; END $$`);
await admin.end();

console.log(`dev database ready on :${port} (${applied.length} migrations applied)`);
console.log(`DATABASE_URL=postgres://dyce_app:dyce_app@localhost:${port}/dyce`);

const stop = async () => {
  await server.stop().catch(() => undefined);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
