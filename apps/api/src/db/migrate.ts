import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './create-db.js';

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL);

  try {
    await migrate(db, { migrationsFolder: './src/db/migrations' });
    console.log('Migrations applied.');
  } finally {
    await pool.end();
  }
}

await main();
