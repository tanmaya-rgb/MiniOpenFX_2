import { toTradeResponse, type TradeRow } from './trade.mapper.js';

function makeRow(overrides: Partial<TradeRow> = {}): TradeRow {
  return {
    id: 'trade-1',
    clientId: 'client-1',
    quoteId: 'quote-1',
    symbol: 'BTCUSDT',
    side: 'BUY',
    baseCurrency: 'BTC',
    quoteCurrency: 'USDT',
    baseAmountMinor: 50_000_000n,
    quoteAmountMinor: 3_356_255_000_000n,
    price: '67125.10000000',
    status: 'FILLED',
    idempotencyKey: 'key-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('toTradeResponse', () => {
  it('formats bigint minor-unit amounts as decimal strings', () => {
    const response = toTradeResponse(makeRow());
    expect(response.baseAmount).toBe('0.5');
    expect(response.quoteAmount).toBe('33562.55');
  });

  it('never leaks internal-only fields (clientId, idempotencyKey)', () => {
    const response = toTradeResponse(makeRow());
    expect(response).not.toHaveProperty('clientId');
    expect(response).not.toHaveProperty('idempotencyKey');
  });

  it('carries the persisted trade status through unchanged', () => {
    expect(toTradeResponse(makeRow({ status: 'FILLED' })).status).toBe(
      'FILLED',
    );
  });

  it('serializes createdAt as an ISO string', () => {
    const response = toTradeResponse(makeRow());
    expect(response.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
