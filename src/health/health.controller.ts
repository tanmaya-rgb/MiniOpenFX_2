import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDb } from '../db/drizzle.module.js';
import { RedisService } from '../redis/redis.service.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    const [postgres, redis] = await Promise.all([
      this.db
        .execute(sql`select 1`)
        .then(() => true)
        .catch(() => false),
      this.redis.ping().catch(() => false),
    ]);

    if (!postgres || !redis) {
      throw new ServiceUnavailableException({ postgres, redis });
    }

    return { status: 'ok', postgres, redis };
  }
}
