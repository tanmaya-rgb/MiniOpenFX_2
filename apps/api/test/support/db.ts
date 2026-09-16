import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createDb } from '../../src/db/create-db.js';
import { balances, clients, ledgerEntries } from '../../src/db/schema.js';

const SECOND_TEST_CLIENT_NAME = 'E2E Second Client';
export const SECOND_TEST_CLIENT_API_KEY = 'e2e-second-client-key';

let cachedClientId: string | null = null;

/**
 * The app only ever seeds one client (`src/db/seed.ts`), by design — this
 * is a single-tenant assignment. Ownership checks (`assertOwnedByClient`)
 * are still real, load-bearing logic, so a couple of e2e tests need a
 * second, genuinely different client to prove a row owned by client A 404s
 * for client B rather than leaking. This mirrors seed.ts's own idempotent
 * upsert-by-unique-name pattern, low bcrypt cost since it's test-only.
 */
export async function ensureSecondTestClient(): Promise<{
  id: string;
  apiKey: string;
}> {
  if (cachedClientId) {
    return { id: cachedClientId, apiKey: SECOND_TEST_CLIENT_API_KEY };
  }

  const { db, pool } = createDb(process.env.DATABASE_URL);
  try {
    const apiKeyHash = await bcrypt.hash(SECOND_TEST_CLIENT_API_KEY, 4);
    const [row] = await db
      .insert(clients)
      .values({ name: SECOND_TEST_CLIENT_NAME, apiKeyHash })
      .onConflictDoUpdate({ target: clients.name, set: { apiKeyHash } })
      .returning();

    if (!row) {
      throw new Error('failed to create or update the second e2e test client');
    }
    cachedClientId = row.id;
    return { id: row.id, apiKey: SECOND_TEST_CLIENT_API_KEY };
  } finally {
    await pool.end();
  }
}

/**
 * Deletes the balance + ledger rows a test created for a synthetic,
 * time-based currency code (see balances.e2e-spec.ts's "fresh balance row"
 * test). Without this, every local e2e run permanently leaves one more
 * garbage currency behind in the shared dev Postgres — there's no per-test
 * DB isolation by design (see CLAUDE.md), so tests that must invent a
 * currency guaranteed not to already exist are responsible for erasing it
 * themselves afterward, not leaving it for a human to notice and clean up.
 */
export async function cleanupSyntheticCurrency(currency: string): Promise<void> {
  const { db, pool } = createDb(process.env.DATABASE_URL);
  try {
    await db.delete(ledgerEntries).where(eq(ledgerEntries.currency, currency));
    await db.delete(balances).where(eq(balances.currency, currency));
  } finally {
    await pool.end();
  }
}
