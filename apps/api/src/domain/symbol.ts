/**
 * Loose shape checks only — length/charset, not existence. Binance is the
 * sole authority on which symbols/currencies actually exist and what a
 * symbol's base/quote assets are (see
 * PricingService.getPrice/getSymbolBreakdown); these regexes exist purely so
 * obviously-malformed input fails fast at the DTO layer before making a
 * network call.
 */
export const SYMBOL_FORMAT_REGEX = /^[A-Z0-9]{5,12}$/;

/** A single currency code, e.g. "BTC" or "USDT" — half of a symbol pair. */
export const CURRENCY_FORMAT_REGEX = /^[A-Z0-9]{2,10}$/;
