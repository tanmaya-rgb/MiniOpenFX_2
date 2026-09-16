import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { authHeader, createTestApp } from './support/app.js';

const API_KEY = process.env.SEEDED_API_KEY!;

async function createActiveQuote(
  app: INestApplication,
  overrides: Partial<{ symbol: string; side: 'BUY' | 'SELL'; baseAmount: string; ttlSeconds: number }> = {},
) {
  const res = await request(app.getHttpServer())
    .post('/v1/quotes')
    .set(authHeader(API_KEY))
    .send({ symbol: 'BTCUSDT', side: 'BUY', baseAmount: '0.001', ttlSeconds: 60, ...overrides })
    .expect(201);
  return res.body as { id: string };
}

function getBalance(app: INestApplication, currency: string) {
  return request(app.getHttpServer())
    .get('/v1/balances')
    .set(authHeader(API_KEY))
    .expect(200)
    .then(({ body }) => (body as Array<{ currency: string; available: string }>).find((b) => b.currency === currency));
}

describe('Trading (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('executes a BUY: debits quote currency, credits base currency, matching the ledger', async () => {
    const usdtBefore = await getBalance(app, 'USDT');
    const btcBefore = await getBalance(app, 'BTC');

    const quote = await createActiveQuote(app, { side: 'BUY', baseAmount: '0.001' });
    const trade = await request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: quote.id })
      .expect(201);

    expect(trade.body).toMatchObject({ quoteId: quote.id, side: 'BUY', status: 'FILLED' });

    const usdtAfter = await getBalance(app, 'USDT');
    const btcAfter = await getBalance(app, 'BTC');

    expect(Number(usdtBefore!.available) - Number(usdtAfter!.available)).toBeCloseTo(
      Number(trade.body.quoteAmount),
      8,
    );
    expect(Number(btcAfter!.available) - Number(btcBefore!.available)).toBeCloseTo(
      Number(trade.body.baseAmount),
      8,
    );
  });

  it('replays idempotently: same key + same quote returns 200 with the unchanged original trade', async () => {
    const quote = await createActiveQuote(app);
    const key = randomUUID();

    const first = await request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', key)
      .send({ quoteId: quote.id })
      .expect(201);

    const replay = await request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', key)
      .send({ quoteId: quote.id })
      .expect(200);

    expect(replay.body).toEqual(first.body);
  });

  it('trims the Idempotency-Key before comparing, so a trailing-space variant still replays', async () => {
    const quote = await createActiveQuote(app);
    const key = randomUUID();

    const first = await request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', key)
      .send({ quoteId: quote.id })
      .expect(201);

    const replay = await request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', `  ${key}  `)
      .send({ quoteId: quote.id })
      .expect(200);

    expect(replay.body.id).toBe(first.body.id);
  });

  it('409s when the same Idempotency-Key is reused against a different quote', async () => {
    const quoteA = await createActiveQuote(app);
    const quoteB = await createActiveQuote(app);
    const key = randomUUID();

    await request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', key)
      .send({ quoteId: quoteA.id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', key)
      .send({ quoteId: quoteB.id })
      .expect(409);
  });

  it('409s executing an already-executed quote, even with a brand-new Idempotency-Key', async () => {
    const quote = await createActiveQuote(app);

    await request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: quote.id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: quote.id })
      .expect(409);
  });

  it('410s executing a quote after its TTL has elapsed', async () => {
    const quote = await createActiveQuote(app, { ttlSeconds: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: quote.id })
      .expect(410);
  });

  it('422s a trade that would exceed the available balance, leaving the balance untouched', async () => {
    const usdtBefore = await getBalance(app, 'USDT');
    // Wildly over any realistic seeded/demo USDT balance.
    const quote = await createActiveQuote(app, { side: 'BUY', baseAmount: '1000' });

    await request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: quote.id })
      .expect(422);

    const usdtAfter = await getBalance(app, 'USDT');
    expect(usdtAfter!.available).toBe(usdtBefore!.available);
  });

  it('400s a missing Idempotency-Key header', async () => {
    const quote = await createActiveQuote(app);

    await request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .send({ quoteId: quote.id })
      .expect(400);
  });

  it('400s a malformed quoteId', () => {
    return request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: 'not-a-uuid' })
      .expect(400);
  });

  it('404s a well-formed but unknown quoteId', () => {
    return request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);
  });

  it('requires auth', async () => {
    const quote = await createActiveQuote(app);
    await request(app.getHttpServer())
      .post('/v1/trades')
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: quote.id })
      .expect(401);
  });

  it('invalidates the quote cache on execution, so a post-execution GET reflects EXECUTED immediately', async () => {
    const quote = await createActiveQuote(app);
    // Warm the read-through cache.
    await request(app.getHttpServer())
      .get(`/v1/quotes/${quote.id}`)
      .set(authHeader(API_KEY))
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/trades')
      .set(authHeader(API_KEY))
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: quote.id })
      .expect(201);

    const fetched = await request(app.getHttpServer())
      .get(`/v1/quotes/${quote.id}`)
      .set(authHeader(API_KEY))
      .expect(200);

    expect(fetched.body.status).toBe('EXECUTED');
  });
});
