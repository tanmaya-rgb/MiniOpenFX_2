import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator.js';
import { ApiKeyAuthGuard } from '../common/guards/api-key-auth.guard.js';
import { CreateQuoteDto } from './dto/create-quote.dto.js';
import { QuotingService } from './quoting.service.js';

@Controller('quotes')
@UseGuards(ApiKeyAuthGuard)
export class QuotingController {
  constructor(private readonly quotingService: QuotingService) {}

  @Post()
  createQuote(@CurrentClientId() clientId: string, @Body() dto: CreateQuoteDto) {
    return this.quotingService.createQuote(clientId, dto);
  }

  @Get(':id')
  getQuote(
    @CurrentClientId() clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotingService.getQuoteById(clientId, id);
  }
}
