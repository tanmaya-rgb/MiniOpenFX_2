import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator.js';
import { CreateTradeDto } from './dto/create-trade.dto.js';
import { TradingService } from './trading.service.js';

@Controller('trades')
export class TradingController {
  constructor(private readonly tradingService: TradingService) {}

  @Post()
  async createTrade(
    @CurrentClientId() clientId: string,
    @Body() dto: CreateTradeDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const { trade, replayed } = await this.tradingService.executeTrade(
      clientId,
      dto,
      idempotencyKey,
    );
    res.status(replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return trade;
  }
}
