import { Decimal } from 'decimal.js';
import type { TradeSide } from '../db/schema.js';
import { fromMinorUnits, roundToMinorUnits } from '../domain/money.js';

export interface QuoteAmount {
  price: string;
  quoteAmountMinor: bigint;
}

/**
 * BUY: client pays quote currency to acquire base, at the (higher) ask.
 * SELL: client gives up base currency, at the (lower) bid.
 *
 * Rounds in the house's favor: what a client owes rounds up, what a client
 * receives rounds down, so fractional minor units never leak either way.
 */
export function computeQuoteAmount(
  side: TradeSide,
  baseAmountMinor: bigint,
  ask: string,
  bid: string,
): QuoteAmount {
  const price = side === 'BUY' ? ask : bid;
  const rawQuoteAmount = fromMinorUnits(baseAmountMinor).mul(price);
  const quoteAmountMinor = roundToMinorUnits(
    rawQuoteAmount,
    side === 'BUY' ? Decimal.ROUND_UP : Decimal.ROUND_DOWN,
  );
  return { price, quoteAmountMinor };
}
