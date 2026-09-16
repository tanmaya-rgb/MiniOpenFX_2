import {
  deserializeQuote,
  serializeQuote,
  toQuoteResponse,
  type QuoteRow,
} from './quote.mapper.js';

function makeRow(overrides: Partial<QuoteRow> = {}): QuoteRow {
  return {
    id: 'quote-1',
    clientId: 'client-1',
    symbol: 'BTCUSDT',
    side: 'BUY',
    baseCurrency: 'BTC',
    quoteCurrency: 'USDT',
    baseAmountMinor: 50_000_000n,
    price: '67125.10000000',
    quoteAmountMinor: 3_356_255_000_000n,
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('toQuoteResponse', () => {
  it('reports ACTIVE for a not-yet-expired ACTIVE quote', () => {
    const row = makeRow({
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(toQuoteResponse(row).status).toBe('ACTIVE');
  });

  it('derives EXPIRED for an ACTIVE quote whose expiresAt has passed, without touching the DB', () => {
    const row = makeRow({
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() - 1),
    });
    expect(toQuoteResponse(row).status).toBe('EXPIRED');
  });

  it('reports EXECUTED even if expiresAt has also passed (EXECUTED wins over expiry)', () => {
    const row = makeRow({
      status: 'EXECUTED',
      expiresAt: new Date(Date.now() - 1),
    });
    expect(toQuoteResponse(row).status).toBe('EXECUTED');
  });

  it('formats bigint minor-unit amounts as decimal strings', () => {
    const row = makeRow({
      baseAmountMinor: 50_000_000n,
      quoteAmountMinor: 3_356_255_000_000n,
    });
    const response = toQuoteResponse(row);
    expect(response.baseAmount).toBe('0.5');
    expect(response.quoteAmount).toBe('33562.55');
  });
});

describe('serializeQuote / deserializeQuote', () => {
  it('round-trips bigint and Date fields through a JSON-safe intermediate form', () => {
    const row = makeRow();
    const cached = serializeQuote(row);

    // The cached form must actually be JSON-safe (no bigint/Date survives JSON.stringify).
    const roundTripped = JSON.parse(JSON.stringify(cached));
    const restored = deserializeQuote(roundTripped);

    expect(restored.baseAmountMinor).toBe(row.baseAmountMinor);
    expect(restored.quoteAmountMinor).toBe(row.quoteAmountMinor);
    expect(restored.expiresAt.toISOString()).toBe(row.expiresAt.toISOString());
    expect(restored.createdAt.toISOString()).toBe(row.createdAt.toISOString());
    expect(restored.id).toBe(row.id);
    expect(restored.status).toBe(row.status);
  });
});
