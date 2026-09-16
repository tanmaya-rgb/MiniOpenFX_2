import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard.js';

/**
 * Applies ApiKeyAuthGuard to every route in the app via APP_GUARD — no
 * per-controller @UseGuards() needed. Routes that must stay public (only
 * /v1/health today) opt out with @Public(), not by omission. Imported
 * once, at the root AppModule.
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: ApiKeyAuthGuard }],
})
export class AuthModule {}
