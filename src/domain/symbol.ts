/**
 * Binance-style symbols concatenate base+quote with no separator
 * (e.g. "BTCUSDT"), so splitting them back apart requires knowing the set of
 * quote currencies we support. Longest quote suffix wins so "BTCUSDT" isn't
 * mis-split against a shorter, coincidentally-matching suffix.
 */
const KNOWN_QUOTE_CURRENCIES = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH'] as const;

export const SYMBOL_FORMAT_REGEX = /^[A-Z0-9]{5,12}$/;

export interface ParsedSymbol {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
}

export class InvalidSymbolError extends Error {}

export function parseSymbol(rawSymbol: string): ParsedSymbol {
  const symbol = rawSymbol.trim().toUpperCase();

  if (!SYMBOL_FORMAT_REGEX.test(symbol)) {
    throw new InvalidSymbolError(`"${rawSymbol}" is not a valid symbol`);
  }

  const quoteCurrency = KNOWN_QUOTE_CURRENCIES.filter((quote) =>
    symbol.endsWith(quote),
  ).sort((a, b) => b.length - a.length)[0];

  if (!quoteCurrency) {
    throw new InvalidSymbolError(
      `"${rawSymbol}" does not end with a supported quote currency (${KNOWN_QUOTE_CURRENCIES.join(', ')})`,
    );
  }

  const baseCurrency = symbol.slice(0, -quoteCurrency.length);
  if (baseCurrency.length < 2) {
    throw new InvalidSymbolError(`"${rawSymbol}" has no base currency`);
  }

  return { symbol, baseCurrency, quoteCurrency };
}
