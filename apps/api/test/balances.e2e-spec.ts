import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, createTestApp } from './support/app.js';

const API_KEY = process.env.SEEDED_API_KEY!;

describe('Balances (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the seeded currencies', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/balances')
      .set(authHeader(API_KEY))
      .expect(200);

    const currencies = (res.body as Array<{ currency: string }>).map((b) => b.currency);
    expect(currencies).toEqual(expect.arrayContaining(['USDT', 'BTC']));
  });

  it('requires auth', () => {
    return request(app.getHttpServer()).get('/v1/balances').expect(401);
  });

  describe('POST /v1/deposits', () => {
    it('increases the target currency balance and returns the full updated balances array', async () => {
      const before = await request(app.getHttpServer())
        .get('/v1/balances')
        .set(authHeader(API_KEY))
        .expect(200);
      const usdtBefore = Number(
        (before.body as Array<{ currency: string; available: string }>).find((b) => b.currency === 'USDT')!
          .available,
      );

      const res = await request(app.getHttpServer())
        .post('/v1/deposits')
        .set(authHeader(API_KEY))
        .send({ currency: 'USDT', amount: '10' })
        .expect(201);

      expect(Array.isArray(res.body)).toBe(true);
      const usdtAfter = Number(
        (res.body as Array<{ currency: string; available: string }>).find((b) => b.currency === 'USDT')!.available,
      );
      expect(usdtAfter - usdtBefore).toBeCloseTo(10, 8);
    });

    it('creates a fresh balance row for a currency the client has never held', async () => {
      const currency = `T${Date.now().toString(36).toUpperCase().slice(-8)}`;
      const res = await request(app.getHttpServer())
        .post('/v1/deposits')
        .set(authHeader(API_KEY))
        .send({ currency, amount: '5' })
        .expect(201);

      const row = (res.body as Array<{ currency: string; available: string }>).find(
        (b) => b.currency === currency,
      );
      expect(row?.available).toBe('5');
    });

    it.each([
      [{ currency: 'USDT', amount: '0' }, 'zero amount'],
      [{ currency: 'USDT', amount: '-5' }, 'negative amount'],
      [{ currency: 'USDT', amount: 'abc' }, 'non-numeric amount'],
      [{ currency: 'US', amount: '' }, 'empty amount'],
      [{ currency: '', amount: '5' }, 'empty currency'],
      [{ currency: 'usdt!', amount: '5' }, 'invalid currency characters'],
    ])('400s on %j (%s)', async (body) => {
      await request(app.getHttpServer())
        .post('/v1/deposits')
        .set(authHeader(API_KEY))
        .send(body)
        .expect(400);
    });

    it('requires auth', () => {
      return request(app.getHttpServer())
        .post('/v1/deposits')
        .send({ currency: 'USDT', amount: '10' })
        .expect(401);
    });
  });
});
