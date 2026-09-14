import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  it('/v1/health (GET) reports postgres and redis as up', () => {
    return request(app.getHttpServer())
      .get('/v1/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ status: 'ok', postgres: true, redis: true });
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
