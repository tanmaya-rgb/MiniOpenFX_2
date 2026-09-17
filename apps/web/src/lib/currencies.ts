/**
 * Fixed list of currencies offered in the pair pickers on the Quote & Trade
 * and Prices pages. Purely a UI convenience for building the `symbol` string
 * sent to the API — the backend (Binance) remains the sole authority on
 * which symbols/currencies are actually valid.
 */
export const SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'USDT', 'USDC', 'FDUSD'] as const;
