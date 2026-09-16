import { Module } from '@nestjs/common';
import { BinanceClient } from './binance.client.js';
import { PricingController } from './pricing.controller.js';
import { PricingService } from './pricing.service.js';

@Module({
  controllers: [PricingController],
  providers: [BinanceClient, PricingService],
  exports: [PricingService],
})
export class PricingModule {}
