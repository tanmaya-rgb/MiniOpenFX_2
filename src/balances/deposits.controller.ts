import { Body, Controller, Post } from '@nestjs/common';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator.js';
import { BalancesService } from './balances.service.js';
import { CreateDepositDto } from './dto/create-deposit.dto.js';

/** Dev/demo-only: the only way to fund a client's balances beyond the seed script. */
@Controller('deposits')
export class DepositsController {
  constructor(private readonly balancesService: BalancesService) {}

  @Post()
  createDeposit(@CurrentClientId() clientId: string, @Body() dto: CreateDepositDto) {
    return this.balancesService.createDeposit(clientId, dto);
  }
}
