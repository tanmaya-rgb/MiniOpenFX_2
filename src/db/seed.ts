import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createDb } from './create-db.js';
import { toMinorUnits } from '../domain/money.js';
import { balances, clients, ledgerEntries } from './schema.js';

const DEMO_CLIENT_NAME = 'Demo Client';

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL);

  try {
    const apiKey = process.env.SEEDED_API_KEY;
    if (!apiKey) {
      throw new Error('SEEDED_API_KEY must be set to seed a client');
    }

    const apiKeyHash = await bcrypt.hash(apiKey, 10);
    const funding: Array<{ currency: string; amount: string }> = [
      { currency: 'USDT', amount: '10000' },
      { currency: 'BTC', amount: '1' },
    ];

    // `onConflictDoNothing` makes this atomic at the database level: if two
    // seed runs race, only one of them gets a row back and funds it.
    const client = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(clients)
        .values({ name: DEMO_CLIENT_NAME, apiKeyHash })
        .onConflictDoNothing({ target: clients.name })
        .returning();

      if (!inserted) {
        return null;
      }

      for (const { currency, amount } of funding) {
        const amountMinor = toMinorUnits(amount);

        await tx.insert(balances).values({
          clientId: inserted.id,
          currency,
          availableMinor: amountMinor,
        });

        await tx.insert(ledgerEntries).values({
          clientId: inserted.id,
          currency,
          deltaMinor: amountMinor,
          reason: 'DEPOSIT',
          refType: 'SEED',
          refId: inserted.id,
        });
      }

      return inserted;
    });

    if (!client) {
      console.log('Already seeded; skipping.');
      return;
    }

    console.log(`Seeded client ${client.id} with API key "${apiKey}"`);
  } finally {
    await pool.end();
  }
}

await main();
