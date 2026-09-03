import fs from 'fs';
import pg from 'pg';

const { Client } = pg;
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  const sql = fs.readFileSync('scripts/db-release0-live-baseline.sql', 'utf8');
  await client.query(sql);
  await client.end();
  console.log('Live-derived baseline bridge applied successfully');
}

main().catch(err => {
  console.error('Failed to apply baseline bridge:', err);
  process.exit(1);
});
