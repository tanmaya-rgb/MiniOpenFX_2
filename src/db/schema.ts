import { sql } from 'drizzle-orm';
import {
  bigint,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Institutional API client. Every quote/trade/balance row is scoped to a
 * client_id, even though the assignment only seeds a single client.
 */
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    apiKeyHash: text('api_key_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Backs the seed script's atomic ON CONFLICT DO NOTHING idempotency
    // check; the assignment only ever seeds one client by this fixed name.
    uniqueIndex('clients_name_unique').on(table.name),
  ],
);

/**
 * Materialized, fast-read balance per client/currency. Always derived from
 * ledger_entries — never written to directly outside of the ledger service.
 */
export const balances = pgTable(
  'balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    currency: text('currency').notNull(),
    availableMinor: bigint('available_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('balances_client_currency_unique').on(
      table.clientId,
      table.currency,
    ),
  ],
);

export const ledgerReasonValues = ['DEPOSIT', 'TRADE'] as const;
export type LedgerReason = (typeof ledgerReasonValues)[number];
export const ledgerReasonEnum = pgEnum('ledger_reason', ledgerReasonValues);

/**
 * Source of truth for all money movement. Every trade writes exactly two
 * rows here (a debit and a credit); balances is a cache over this table.
 */
export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id),
  currency: text('currency').notNull(),
  deltaMinor: bigint('delta_minor', { mode: 'bigint' }).notNull(),
  reason: ledgerReasonEnum('reason').notNull(),
  refType: text('ref_type').notNull(),
  refId: uuid('ref_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tradeSideValues = ['BUY', 'SELL'] as const;
export type TradeSide = (typeof tradeSideValues)[number];
export const tradeSideEnum = pgEnum('trade_side', tradeSideValues);

export const quoteStatusValues = ['ACTIVE', 'EXPIRED', 'EXECUTED'] as const;
export type QuoteStatus = (typeof quoteStatusValues)[number];
export const quoteStatusEnum = pgEnum('quote_status', quoteStatusValues);

/**
 * A firm, time-boxed price lock. Trades execute against a quote, never
 * directly against a live price, so expiry/validation has real meaning.
 */
export const quotes = pgTable('quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id),
  symbol: text('symbol').notNull(),
  side: tradeSideEnum('side').notNull(),
  baseCurrency: text('base_currency').notNull(),
  quoteCurrency: text('quote_currency').notNull(),
  baseAmountMinor: bigint('base_amount_minor', { mode: 'bigint' }).notNull(),
  price: text('price').notNull(),
  quoteAmountMinor: bigint('quote_amount_minor', { mode: 'bigint' }).notNull(),
  status: quoteStatusEnum('status').notNull().default('ACTIVE'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tradeStatusValues = ['FILLED', 'REJECTED'] as const;
export type TradeStatusValue = (typeof tradeStatusValues)[number];
export const tradeStatusEnum = pgEnum('trade_status', tradeStatusValues);

/**
 * An immutable, executed trade. UNIQUE(quote_id) guarantees a quote can be
 * executed at most once; UNIQUE(client_id, idempotency_key) makes retried
 * POST /v1/trades calls safe to replay.
 */
export const trades = pgTable(
  'trades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id),
    symbol: text('symbol').notNull(),
    side: tradeSideEnum('side').notNull(),
    baseCurrency: text('base_currency').notNull(),
    quoteCurrency: text('quote_currency').notNull(),
    baseAmountMinor: bigint('base_amount_minor', { mode: 'bigint' }).notNull(),
    quoteAmountMinor: bigint('quote_amount_minor', {
      mode: 'bigint',
    }).notNull(),
    price: text('price').notNull(),
    status: tradeStatusEnum('status').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('trades_quote_id_unique').on(table.quoteId),
    uniqueIndex('trades_client_idempotency_key_unique').on(
      table.clientId,
      table.idempotencyKey,
    ),
  ],
);
