import { Module } from '@nestjs/common';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard.js';

/**
 * Provided once here and imported by anything that needs it, so Nest
 * instantiates a single ApiKeyAuthGuard rather than one per consuming
 * module (each paying its own client-table scan + bcrypt.compare cost).
 */
@Module({
  providers: [ApiKeyAuthGuard],
  exports: [ApiKeyAuthGuard],
})
export class AuthModule {}
