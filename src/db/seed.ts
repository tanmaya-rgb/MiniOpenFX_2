import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { toMinorUnits } from '../domain/money.js';
import { balances, clients, ledgerEntries } from './schema.js';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, {
    schema: { balances, clients, ledgerEntries },
  });

  const apiKey = process.env.SEEDED_API_KEY;
  if (!apiKey) {
    throw new Error('SEEDED_API_KEY must be set to seed a client');
  }

  const [client] = await db
    .insert(clients)
    .values({
      name: 'Demo Client',
      apiKeyHash: await bcrypt.hash(apiKey, 10),
    })
    .returning();

  const funding: Array<{ currency: string; amount: string }> = [
    { currency: 'USDT', amount: '10000' },
    { currency: 'BTC', amount: '1' },
  ];

  for (const { currency, amount } of funding) {
    const amountMinor = toMinorUnits(amount);

    await db.insert(balances).values({
      clientId: client.id,
      currency,
      availableMinor: amountMinor,
    });

    await db.insert(ledgerEntries).values({
      clientId: client.id,
      currency,
      deltaMinor: amountMinor,
      reason: 'DEPOSIT',
      refType: 'SEED',
      refId: client.id,
    });
  }

  await pool.end();

  console.log(`Seeded client ${client.id} with API key "${apiKey}"`);
}

await main();
