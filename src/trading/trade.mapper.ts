import { formatMinorUnits } from '../domain/money.js';
import type { TradeSide, TradeStatusValue } from '../db/schema.js';

/** The shape returned by a Drizzle select/insert against the trades table. */
export interface TradeRow {
  id: string;
  clientId: string;
  quoteId: string;
  symbol: string;
  side: TradeSide;
  baseCurrency: string;
  quoteCurrency: string;
  baseAmountMinor: bigint;
  quoteAmountMinor: bigint;
  price: string;
  status: TradeStatusValue;
  idempotencyKey: string;
  createdAt: Date;
}

export interface TradeResponse {
  id: string;
  quoteId: string;
  symbol: string;
  side: TradeSide;
  baseCurrency: string;
  quoteCurrency: string;
  baseAmount: string;
  quoteAmount: string;
  price: string;
  status: TradeStatusValue;
  createdAt: string;
}

export function toTradeResponse(row: TradeRow): TradeResponse {
  return {
    id: row.id,
    quoteId: row.quoteId,
    symbol: row.symbol,
    side: row.side,
    baseCurrency: row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    baseAmount: formatMinorUnits(row.baseAmountMinor),
    quoteAmount: formatMinorUnits(row.quoteAmountMinor),
    price: row.price,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
