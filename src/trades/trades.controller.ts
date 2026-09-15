import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator.js';
import { ApiKeyAuthGuard } from '../common/guards/api-key-auth.guard.js';
import { GetTradesQueryDto } from './dto/get-trades-query.dto.js';
import { TradesService } from './trades.service.js';

@Controller('trades')
@UseGuards(ApiKeyAuthGuard)
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
