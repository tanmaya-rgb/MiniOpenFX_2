import { CURRENCY_FORMAT_REGEX, SYMBOL_FORMAT_REGEX } from './symbol.js';

describe('SYMBOL_FORMAT_REGEX', () => {
  it.each(['BTCUSDT', 'ETHUSDT', 'BTCFDUSD', 'ABCDE'])(
    'accepts a well-shaped symbol %s',
    (symbol) => {
      expect(SYMBOL_FORMAT_REGEX.test(symbol)).toBe(true);
    },
  );

  it.each([
    'btcusdt', // lowercase
    'BTC-USDT', // punctuation
    'ABCD', // too short (< 5)
    'ABCDEFGHIJKLM', // too long (> 12)
    '',
    'BTC USDT', // whitespace
  ])('rejects a malformed symbol %s', (symbol) => {
    expect(SYMBOL_FORMAT_REGEX.test(symbol)).toBe(false);
  });
});

describe('CURRENCY_FORMAT_REGEX', () => {
  it.each(['BTC', 'ETH', 'USDT', 'FDUSD', 'AB'])(
    'accepts a well-shaped currency code %s',
    (currency) => {
      expect(CURRENCY_FORMAT_REGEX.test(currency)).toBe(true);
    },
  );

  it.each([
    'btc', // lowercase
    'B', // too short (< 2)
    'ABCDEFGHKLM', // too long (> 10)
    '',
    'US-DT', // punctuation
    'BTC USDT', // whitespace
  ])('rejects a malformed currency code %s', (currency) => {
    expect(CURRENCY_FORMAT_REGEX.test(currency)).toBe(false);
  });
});
