/**
 * Minimal migration runner — applies all *.up.sql files in order.
 * Run with: npx ts-node src/backend/models/migrations/migrate.ts
 * Roll back with: npx ts-node src/backend/models/migrations/migrate.ts down
 */
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { config } from '../../config/env';

const pool = new Pool({ connectionString: config.databaseUrl });
const dir = __dirname;
const direction = process.argv[2] === 'down' ? 'down' : 'up';

async function run(): Promise<void> {
  const suffix = `.${direction}.sql`;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .sort();

  if (direction === 'down') files.reverse();

  const client = await pool.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      console.log(`Running ${file}...`);
      await client.query(sql);
      console.log(`  done.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
