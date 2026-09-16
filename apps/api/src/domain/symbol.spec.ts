import { SYMBOL_FORMAT_REGEX } from './symbol.js';

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
