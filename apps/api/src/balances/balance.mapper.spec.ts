import { toBalanceResponse } from './balance.mapper.js';

describe('toBalanceResponse', () => {
  it('formats a bigint minor-unit balance as a decimal string', () => {
    expect(
      toBalanceResponse({
        currency: 'USDT',
        availableMinor: 1_000_000_000_000n,
      }),
    ).toEqual({
      currency: 'USDT',
      available: '10000',
    });
  });

  it('formats a zero balance', () => {
    expect(toBalanceResponse({ currency: 'BTC', availableMinor: 0n })).toEqual({
      currency: 'BTC',
      available: '0',
    });
  });

  it('preserves sub-unit precision', () => {
    expect(toBalanceResponse({ currency: 'BTC', availableMinor: 1n })).toEqual({
      currency: 'BTC',
      available: '1e-8',
    });
  });
});
