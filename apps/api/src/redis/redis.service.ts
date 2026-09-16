import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants.js';

/**
 * Redis here is always an optimization layer in front of Postgres, never a
 * source of truth (see README trade-offs). Every method below fails soft: a
 * cache outage or a corrupt cached value degrades to a cache miss, never
 * breaks the caller's request. The ioredis client is configured with a
 * command timeout (see redis.module.ts) so a stalled connection still
 * surfaces as a rejection here instead of hanging indefinitely.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async getJson<T>(key: string): Promise<T | null> {
    return this.failSoft(
      'read',
      key,
      async () => {
        const raw = await this.client.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
      },
      null,
    );
  }

  async setJson(key: string, value: unknown, ttlMs: number): Promise<void> {
    await this.failSoft(
      'write',
      key,
      async () => {
        await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
      },
      undefined,
    );
  }

  async del(key: string): Promise<void> {
    await this.failSoft(
      'delete',
      key,
      async () => {
        await this.client.del(key);
      },
      undefined,
    );
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === 'PONG';
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }

  private async failSoft<T>(
    action: string,
    key: string,
    fn: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn(
        `Cache ${action} failed for key "${key}": ${(error as Error).message}`,
      );
      return fallback;
    }
  }
}
