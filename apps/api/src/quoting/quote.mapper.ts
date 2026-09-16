import { formatMinorUnits } from '../domain/money.js';
import type { QuoteStatus, TradeSide } from '../db/schema.js';

const CACHE_KEY_PREFIX = 'quote:';

/** Shared with anything (e.g. the trading service) that must invalidate a cached quote. */
export function quoteCacheKey(id: string): string {
  return `${CACHE_KEY_PREFIX}${id}`;
}

/** The shape returned by a Drizzle select/insert against the quotes table. */
export interface QuoteRow {
  id: string;
  clientId: string;
  symbol: string;
  side: TradeSide;
  baseCurrency: string;
  quoteCurrency: string;
  baseAmountMinor: bigint;
  price: string;
  quoteAmountMinor: bigint;
  status: QuoteStatus;
  expiresAt: Date;
  createdAt: Date;
}

/** JSON-safe form of QuoteRow for Redis (no bigint, no Date). */
export interface CachedQuote extends Omit<
  QuoteRow,
  'baseAmountMinor' | 'quoteAmountMinor' | 'expiresAt' | 'createdAt'
> {
  baseAmountMinor: string;
  quoteAmountMinor: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * ACTIVE/EXECUTED are real, persisted statuses (QuoteStatus); EXPIRED is
 * never written to the DB — it exists only here, computed at read time.
 */
export type QuoteDisplayStatus = QuoteStatus | 'EXPIRED';

export interface QuoteResponse {
  id: string;
  symbol: string;
  side: TradeSide;
  baseCurrency: string;
  quoteCurrency: string;
  baseAmount: string;
  price: string;
  quoteAmount: string;
  status: QuoteDisplayStatus;
  expiresAt: string;
  createdAt: string;
}

export function serializeQuote(row: QuoteRow): CachedQuote {
  return {
    ...row,
    baseAmountMinor: row.baseAmountMinor.toString(),
    quoteAmountMinor: row.quoteAmountMinor.toString(),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function deserializeQuote(cached: CachedQuote): QuoteRow {
  return {
    ...cached,
    baseAmountMinor: BigInt(cached.baseAmountMinor),
    quoteAmountMinor: BigInt(cached.quoteAmountMinor),
    expiresAt: new Date(cached.expiresAt),
    createdAt: new Date(cached.createdAt),
  };
}

/**
 * The DB status only ever transitions ACTIVE -> EXECUTED (set by the
 * trading service). Expiry is never written back to the row (no background
 * job, per the reliability design) — it's computed here at read time by
 * comparing expiresAt against now.
 */
export function toQuoteResponse(row: QuoteRow): QuoteResponse {
  const isLogicallyExpired =
    row.status === 'ACTIVE' && Date.now() >= row.expiresAt.getTime();

  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    baseCurrency: row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    baseAmount: formatMinorUnits(row.baseAmountMinor),
    price: row.price,
    quoteAmount: formatMinorUnits(row.quoteAmountMinor),
    status: isLogicallyExpired ? 'EXPIRED' : row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
