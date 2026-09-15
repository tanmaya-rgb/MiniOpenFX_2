import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BalancesModule } from './balances/balances.module.js';
import { validateEnv } from './config/env.validation.js';
import { DrizzleModule } from './db/drizzle.module.js';
import { HealthModule } from './health/health.module.js';
import { PricingModule } from './pricing/pricing.module.js';
import { QuotingModule } from './quoting/quoting.module.js';
import { RedisModule } from './redis/redis.module.js';
import { TradesModule } from './trades/trades.module.js';
import { TradingModule } from './trading/trading.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DrizzleModule,
    RedisModule,
    HealthModule,
    PricingModule,
    QuotingModule,
    TradingModule,
    BalancesModule,
    TradesModule,
  ],
})
export class AppModule {}
