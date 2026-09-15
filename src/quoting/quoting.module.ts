import { Module } from '@nestjs/common';
import { ApiKeyAuthGuard } from '../common/guards/api-key-auth.guard.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { QuotingController } from './quoting.controller.js';
import { QuotingService } from './quoting.service.js';

@Module({
  imports: [PricingModule],
  controllers: [QuotingController],
  providers: [QuotingService, ApiKeyAuthGuard],
  exports: [QuotingService],
})
export class QuotingModule {}
