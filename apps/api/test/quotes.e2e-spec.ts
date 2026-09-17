import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, createTestApp } from './support/app.js';
import { ensureSecondTestClient } from './support/db.js';

const API_KEY = process.env.SEEDED_API_KEY!;

describe('Quotes (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an ACTIVE quote priced off a live Binance lookup', async () => {
    const before = Date.now();
    const res = await request(app.getHttpServer())
      .post('/v1/quotes')
      .set(authHeader(API_KEY))
      .send({
        symbol: 'BTCUSDT',
        side: 'BUY',
        baseAmount: '0.001',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      symbol: 'BTCUSDT',
      side: 'BUY',
      baseCurrency: 'BTC',
      quoteCurrency: 'USDT',
      baseAmount: '0.001',
      status: 'ACTIVE',
    });
    expect(Number(res.body.price)).toBeGreaterThan(0);
    expect(Number(res.body.quoteAmount)).toBeGreaterThan(0);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(
      before + 14_000,
    );
  });

  it('SELL is priced independently of BUY (bid vs ask)', async () => {
    const buy = await request(app.getHttpServer())
      .post('/v1/quotes')
      .set(authHeader(API_KEY))
      .send({
        symbol: 'BTCUSDT',
        side: 'BUY',
        baseAmount: '0.001',
      })
      .expect(201);
    const sell = await request(app.getHttpServer())
      .post('/v1/quotes')
      .set(authHeader(API_KEY))
      .send({
        symbol: 'BTCUSDT',
        side: 'SELL',
        baseAmount: '0.001',
      })
      .expect(201);

    // ask >= bid always holds on a real order book.
    expect(Number(buy.body.price)).toBeGreaterThanOrEqual(
      Number(sell.body.price),
    );
  });

  it.each([
    [
      { symbol: 'BTCUSDT', side: 'HOLD', baseAmount: '0.5' },
      'invalid side',
    ],
    [
      {
        symbol: 'BTCUSDT',
        side: 'BUY',
        baseAmount: '0.123456789',
      },
      'too many decimals',
    ],
    [
      { symbol: 'BTCUSDT', side: 'BUY', baseAmount: '-1' },
      'negative amount',
    ],
    [
      { symbol: 'btc', side: 'BUY', baseAmount: '0.5' },
      'malformed symbol',
    ],
  ])('400s on %j (%s)', async (body) => {
    await request(app.getHttpServer())
      .post('/v1/quotes')
      .set(authHeader(API_KEY))
      .send(body)
      .expect(400);
  });

  it('400s when a live pricing error propagates through quote creation', () => {
    return request(app.getHttpServer())
      .post('/v1/quotes')
      .set(authHeader(API_KEY))
      .send({
        symbol: 'ZZZZZUSDT',
        side: 'BUY',
        baseAmount: '0.5',
      })
      .expect(400);
  });

  it('requires auth', () => {
    return request(app.getHttpServer())
      .post('/v1/quotes')
      .send({
        symbol: 'BTCUSDT',
        side: 'BUY',
        baseAmount: '0.5',
      })
      .expect(401);
  });

  describe('GET /v1/quotes/:id', () => {
    it('returns a previously created quote', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/quotes')
        .set(authHeader(API_KEY))
        .send({
          symbol: 'BTCUSDT',
          side: 'BUY',
          baseAmount: '0.001',
        })
        .expect(201);

      const fetched = await request(app.getHttpServer())
        .get(`/v1/quotes/${created.body.id}`)
        .set(authHeader(API_KEY))
        .expect(200);

      expect(fetched.body).toEqual(created.body);
    });

    it(
      'derives EXPIRED once the TTL has elapsed, without the DB status ever changing',
      async () => {
        const created = await request(app.getHttpServer())
          .post('/v1/quotes')
          .set(authHeader(API_KEY))
          .send({
            symbol: 'BTCUSDT',
            side: 'BUY',
            baseAmount: '0.001',
          })
          .expect(201);

        // TTL is a fixed 15s server-side (see quoting.service.ts); wait it out.
        await new Promise((resolve) => setTimeout(resolve, 15_100));

        const fetched = await request(app.getHttpServer())
          .get(`/v1/quotes/${created.body.id}`)
          .set(authHeader(API_KEY))
          .expect(200);

        expect(fetched.body.status).toBe('EXPIRED');
      },
      20_000,
    );

    it('400s a malformed (non-UUID) id', () => {
      return request(app.getHttpServer())
        .get('/v1/quotes/not-a-uuid')
        .set(authHeader(API_KEY))
        .expect(400);
    });

    it('404s a well-formed but unknown id', () => {
      return request(app.getHttpServer())
        .get('/v1/quotes/00000000-0000-0000-0000-000000000000')
        .set(authHeader(API_KEY))
        .expect(404);
    });

    it('404s (not 403, never leaking existence) a quote that belongs to a different client', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/quotes')
        .set(authHeader(API_KEY))
        .send({
          symbol: 'BTCUSDT',
          side: 'BUY',
          baseAmount: '0.001',
        })
        .expect(201);

      const other = await ensureSecondTestClient();

      return request(app.getHttpServer())
        .get(`/v1/quotes/${created.body.id}`)
        .set(authHeader(other.apiKey))
        .expect(404);
    });
  });
});
