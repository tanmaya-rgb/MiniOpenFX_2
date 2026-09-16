import { Controller, Get, Query } from '@nestjs/common';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator.js';
import { GetTradesQueryDto } from './dto/get-trades-query.dto.js';
import { TradesService } from './trades.service.js';

@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Get()
  getTradeHistory(
    @CurrentClientId() clientId: string,
    @Query() query: GetTradesQueryDto,
  ) {
    return this.tradesService.getTradeHistory(clientId, query);
  }
}
