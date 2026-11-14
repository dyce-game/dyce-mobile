// Usage: DATABASE_URL=postgres://... pnpm -F @dyce/api db:migrate
import pg from 'pg';
import { migrate } from './migrator.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
  const { applied, skipped } = await migrate(pool);
  console.log(`migrations: ${applied.length} applied, ${skipped.length} already up to date`);
  for (const f of applied) console.log(`  + ${f}`);
} finally {
  await pool.end();
}
