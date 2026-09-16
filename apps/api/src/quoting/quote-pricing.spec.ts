import { computeQuoteAmount } from './quote-pricing.js';

describe('computeQuoteAmount', () => {
  it('BUY prices at the ask', () => {
    const result = computeQuoteAmount(
      'BUY',
      50_000_000n /* 0.5 */,
      '67125.10',
      '67123.45',
    );
    expect(result.price).toBe('67125.10');
  });

  it('SELL prices at the bid', () => {
    const result = computeQuoteAmount(
      'SELL',
      50_000_000n /* 0.5 */,
      '67125.10',
      '67123.45',
    );
    expect(result.price).toBe('67123.45');
  });

  it('BUY rounds the quote amount UP (in the house favor for what a client owes)', () => {
    // 0.00000003 * 0.5 = 0.000000015, exactly halfway between 1 and 2 minor
    // units -> rounds away from zero (up) to 2.
    const result = computeQuoteAmount('BUY', 3n, '0.5', '0.5');
    expect(result.quoteAmountMinor).toBe(2n);
  });

  it('SELL rounds the quote amount DOWN (in the house favor for what a client receives)', () => {
    // Same halfway-point amount, but SELL truncates toward zero instead.
    const result = computeQuoteAmount('SELL', 3n, '0.5', '0.5');
    expect(result.quoteAmountMinor).toBe(1n);
  });

  it('computes the expected quote amount for a realistic BUY', () => {
    // 0.5 BTC at an ask of 67125.10 USDT/BTC = 33562.55 USDT exactly.
    const result = computeQuoteAmount(
      'BUY',
      50_000_000n,
      '67125.10',
      '67123.45',
    );
    expect(result.quoteAmountMinor).toBe(3_356_255_000_000n);
  });

  it('can legitimately round down to zero for a tiny SELL amount', () => {
    // A base amount small enough that, at this price, the SELL proceeds
    // round down below one minor unit — callers must check for this
    // (see QuotingService.createQuote), computeQuoteAmount itself doesn't throw.
    const result = computeQuoteAmount('SELL', 1n, '1', '0.4');
    expect(result.quoteAmountMinor).toBe(0n);
  });
});
