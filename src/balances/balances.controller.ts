import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator.js';
import { ApiKeyAuthGuard } from '../common/guards/api-key-auth.guard.js';
import { BalancesService } from './balances.service.js';

@Controller('balances')
@UseGuards(ApiKeyAuthGuard)
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @Get()
  getBalances(@CurrentClientId() clientId: string) {
    return this.balancesService.getBalances(clientId);
  }
}
