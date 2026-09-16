import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

/**
 * Single place `pg.Pool` connection options are decided, so the Nest
 * DrizzleModule and the standalone migrate/seed scripts never drift apart.
 */
export function createPgPool(connectionString: string | undefined): Pool {
  return new Pool({ connectionString });
}

export function createDb(connectionString: string | undefined) {
  const pool = createPgPool(connectionString);
  const db = drizzle(pool, { schema });
  return { db, pool };
}
