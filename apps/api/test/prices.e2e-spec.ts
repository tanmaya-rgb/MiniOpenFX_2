import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, createTestApp } from './support/app.js';

const API_KEY = process.env.SEEDED_API_KEY!;

describe('Prices (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a live indicative price for a known symbol', () => {
    return request(app.getHttpServer())
      .get('/v1/prices?symbol=BTCUSDT')
      .set(authHeader(API_KEY))
      .expect(200)
      .expect(({ body }) => {
        expect(body.symbol).toBe('BTCUSDT');
        expect(body.source).toBe('binance');
        expect(Number(body.bid)).toBeGreaterThan(0);
        expect(Number(body.ask)).toBeGreaterThan(0);
        expect(Number(body.ask)).toBeGreaterThanOrEqual(Number(body.bid));
        expect(typeof body.timestamp).toBe('number');
      });
  });

  it('normalizes symbol case', () => {
    return request(app.getHttpServer())
      .get('/v1/prices?symbol=btcusdt')
      .set(authHeader(API_KEY))
      .expect(200)
      .expect(({ body }) => {
        expect(body.symbol).toBe('BTCUSDT');
      });
  });

  it('400s a malformed symbol before ever reaching Binance', () => {
    return request(app.getHttpServer())
      .get('/v1/prices?symbol=btc')
      .set(authHeader(API_KEY))
      .expect(400);
  });

  it('400s a missing symbol query param', () => {
    return request(app.getHttpServer())
      .get('/v1/prices')
      .set(authHeader(API_KEY))
      .expect(400);
  });

  it('400s a well-formed but nonexistent symbol (real Binance rejection)', () => {
    return request(app.getHttpServer())
      .get('/v1/prices?symbol=ZZZZZUSDT')
      .set(authHeader(API_KEY))
      .expect(400);
  });
});
