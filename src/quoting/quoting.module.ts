import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module.js';
import { QuotingController } from './quoting.controller.js';
import { QuotingService } from './quoting.service.js';

@Module({
  imports: [PricingModule],
  controllers: [QuotingController],
  providers: [QuotingService],
  exports: [QuotingService],
})
export class QuotingModule {}
