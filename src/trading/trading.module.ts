import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { QuotingModule } from '../quoting/quoting.module.js';
import { TradingController } from './trading.controller.js';
import { TradingService } from './trading.service.js';

@Module({
  imports: [LedgerModule, QuotingModule],
  controllers: [TradingController],
  providers: [TradingService],
})
export class TradingModule {}
