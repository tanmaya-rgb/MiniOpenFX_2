import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, createTestApp } from './support/app.js';

const API_KEY = process.env.SEEDED_API_KEY!;

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a protected route with no Authorization header', () => {
    return request(app.getHttpServer())
      .get('/v1/balances')
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
  });

  it('rejects a malformed Authorization header (not "Bearer <key>")', () => {
    return request(app.getHttpServer())
      .get('/v1/balances')
      .set('Authorization', API_KEY)
      .expect(401);
  });

  it('rejects a well-formed but wrong API key', () => {
    return request(app.getHttpServer())
      .get('/v1/balances')
      .set(authHeader('definitely-not-the-real-key'))
      .expect(401);
  });

  it('accepts a valid API key', () => {
    return request(app.getHttpServer())
      .get('/v1/balances')
      .set(authHeader(API_KEY))
      .expect(200);
  });

  it('every error response uses the {error:{code,message}} envelope, even for auth failures', () => {
    return request(app.getHttpServer())
      .get('/v1/balances')
      .expect(401)
      .expect(({ body }) => {
        expect(body).toEqual({
          error: { code: expect.any(String), message: expect.any(String) },
        });
      });
  });

  it('GET /v1/health remains public (no Authorization header required)', () => {
    return request(app.getHttpServer()).get('/v1/health').expect(200);
  });

  it('GET /v1/prices requires auth even though it is "just market data"', () => {
    return request(app.getHttpServer())
      .get('/v1/prices?baseCurrency=BTC&quoteCurrency=USDT')
      .expect(401);
  });
});
