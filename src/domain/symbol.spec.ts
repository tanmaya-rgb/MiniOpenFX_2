import { InvalidSymbolError, parseSymbol } from './symbol.js';

describe('parseSymbol', () => {
  it('splits a known symbol into base and quote currency', () => {
    expect(parseSymbol('btcusdt')).toEqual({
      symbol: 'BTCUSDT',
      baseCurrency: 'BTC',
      quoteCurrency: 'USDT',
    });
  });

  it('prefers the longest matching quote suffix', () => {
    expect(parseSymbol('ETHBTC')).toEqual({
      symbol: 'ETHBTC',
      baseCurrency: 'ETH',
      quoteCurrency: 'BTC',
    });
  });

  it('rejects malformed symbols', () => {
    expect(() => parseSymbol('btc-usdt')).toThrow(InvalidSymbolError);
    expect(() => parseSymbol('AB')).toThrow(InvalidSymbolError);
  });

  it('rejects symbols with no supported quote currency', () => {
    expect(() => parseSymbol('BTCXYZ')).toThrow(InvalidSymbolError);
  });
});
