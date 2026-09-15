import { Controller, Get, Query } from '@nestjs/common';
import { GetPriceDto } from './dto/get-price.dto.js';
import { PricingService } from './pricing.service.js';

@Controller('prices')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  getPrice(@Query() query: GetPriceDto) {
    return this.pricingService.getPrice(query.symbol);
  }
}
