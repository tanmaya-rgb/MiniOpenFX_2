/**
 * Loose shape check only — length/charset, not existence. Binance is the
 * sole authority on which symbols actually exist and what their base/quote
 * assets are (see PricingService.getPrice/getSymbolBreakdown); this regex
 * exists purely so obviously-malformed input fails fast at the DTO layer
 * before making a network call.
 */
export const SYMBOL_FORMAT_REGEX = /^[A-Z0-9]{5,12}$/;
