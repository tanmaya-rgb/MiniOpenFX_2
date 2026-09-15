import { Global, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { createPgPool } from './create-db.js';
import * as schema from './schema.js';

export const DRIZZLE = Symbol('DRIZZLE');
export const PG_POOL = Symbol('PG_POOL');
export type DrizzleDb = NodePgDatabase<typeof schema>;
/** The `tx` param passed into `db.transaction(async (tx) => ...)`. */
export type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Pool =>
        createPgPool(config.get<string>('DATABASE_URL')),
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): DrizzleDb => drizzle(pool, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DrizzleModule implements OnModuleDestroy {
  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleDestroy() {
    const pool = this.moduleRef.get<Pool>(PG_POOL, { strict: false });
    await pool?.end();
  }
}
