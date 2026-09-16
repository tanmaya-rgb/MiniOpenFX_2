import { Controller, Get } from '@nestjs/common';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator.js';
import { BalancesService } from './balances.service.js';

@Controller('balances')
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @Get()
  getBalances(@CurrentClientId() clientId: string) {
    return this.balancesService.getBalances(clientId);
  }
}
