import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { authHeader, createTestApp } from './support/app.js';
import { ensureSecondTestClient } from './support/db.js';

const API_KEY = process.env.SEEDED_API_KEY!;

async function executeFreshTrade(app: INestApplication): Promise<string> {
  const quote = await request(app.getHttpServer())
    .post('/v1/quotes')
    .set(authHeader(API_KEY))
    .send({
      symbol: 'BTCUSDT',
      side: 'BUY',
      baseAmount: '0.0001',
      ttlSeconds: 60,
    })
    .expect(201);

  const trade = await request(app.getHttpServer())
    .post('/v1/trades')
    .set(authHeader(API_KEY))
    .set('Idempotency-Key', randomUUID())
    .send({ quoteId: quote.body.id })
    .expect(201);

  return trade.body.id as string;
}

describe('Trade History (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists trades newest first', async () => {
    const first = await executeFreshTrade(app);
    const second = await executeFreshTrade(app);

    const res = await request(app.getHttpServer())
      .get('/v1/trades?limit=2')
      .set(authHeader(API_KEY))
      .expect(200);

    const ids = (res.body.trades as Array<{ id: string }>).map((t) => t.id);
    expect(ids.indexOf(second)).toBeLessThan(ids.indexOf(first));
  });

  it('paginates with no duplicates and no gaps across pages', async () => {
    const created = [
      await executeFreshTrade(app),
      await executeFreshTrade(app),
      await executeFreshTrade(app),
    ];

    const seen: string[] = [];
    let cursor: string | undefined;
    // limit=1 forces at least 3 pages to walk through everything just created.
    for (let i = 0; i < 20; i++) {
      const res = await request(app.getHttpServer())
        .get('/v1/trades')
        .query({ limit: 1, ...(cursor ? { cursor } : {}) })
        .set(authHeader(API_KEY))
        .expect(200);

      for (const trade of res.body.trades as Array<{ id: string }>) {
        expect(seen).not.toContain(trade.id);
        seen.push(trade.id);
      }

      cursor = res.body.nextCursor ?? undefined;
      if (!cursor) break;
    }

    for (const id of created) {
      expect(seen).toContain(id);
    }
  });

  it.each([
    [{ limit: '0' }, 'limit below minimum'],
    [{ limit: '101' }, 'limit above maximum'],
    [{ limit: 'abc' }, 'non-numeric limit'],
  ])('400s on %j (%s)', async (query) => {
    await request(app.getHttpServer())
      .get('/v1/trades')
      .query(query)
      .set(authHeader(API_KEY))
      .expect(400);
  });

  it('400s a malformed cursor', () => {
    return request(app.getHttpServer())
      .get('/v1/trades')
      .query({ cursor: 'not-a-real-cursor' })
      .set(authHeader(API_KEY))
      .expect(400);
  });

  it('requires auth', () => {
    return request(app.getHttpServer()).get('/v1/trades').expect(401);
  });

  it("never leaks another client's trades", async () => {
    const mine = await executeFreshTrade(app);
    const other = await ensureSecondTestClient();

    const res = await request(app.getHttpServer())
      .get('/v1/trades')
      .set(authHeader(other.apiKey))
      .expect(200);

    const ids = (res.body.trades as Array<{ id: string }>).map((t) => t.id);
    expect(ids).not.toContain(mine);
  });
});
