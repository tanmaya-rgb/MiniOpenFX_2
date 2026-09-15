import { Module } from '@nestjs/common';
import { AuthModule } from '../common/auth.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { BalancesController } from './balances.controller.js';
import { BalancesService } from './balances.service.js';
import { DepositsController } from './deposits.controller.js';

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [BalancesController, DepositsController],
  providers: [BalancesService],
})
export class BalancesModule {}
