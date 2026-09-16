import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DRIZZLE, type DrizzleDb } from '../db/drizzle.module.js';
import { balances } from '../db/schema.js';
import { toMinorUnits } from '../domain/money.js';
import { LedgerService } from '../ledger/ledger.service.js';
import type { CreateDepositDto } from './dto/create-deposit.dto.js';
import {
  toBalanceResponse,
  type BalanceResponse,
  type BalanceRow,
} from './balance.mapper.js';

@Injectable()
export class BalancesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly ledger: LedgerService,
  ) {}

  async getBalances(clientId: string): Promise<BalanceResponse[]> {
    const rows = (await this.db
      .select({
        currency: balances.currency,
        availableMinor: balances.availableMinor,
      })
      .from(balances)
      .where(eq(balances.clientId, clientId))
      .orderBy(balances.currency)) as BalanceRow[];

    return rows.map(toBalanceResponse);
  }

  /**
   * Dev/demo-only: there is no real funding rail (bank transfer, on-chain
   * deposit, etc.) in this assignment's scope, so this is the only way to
   * get money into the system for a client beyond the seeded balances.
   */
  async createDeposit(
    clientId: string,
    dto: CreateDepositDto,
  ): Promise<BalanceResponse[]> {
    let amountMinor: bigint;
    try {
      amountMinor = toMinorUnits(dto.amount);
    } catch {
      throw new BadRequestException(
        'amount must not have more than 8 decimal places',
      );
    }
    if (amountMinor <= 0n) {
      throw new BadRequestException('amount must be greater than zero');
    }

    const depositId = uuidv4();

    await this.db.transaction(async (tx) => {
      const lock = await this.ledger.lockBalanceRows(tx, clientId, [
        dto.currency,
      ]);
      await this.ledger.credit(tx, lock, {
        clientId,
        currency: dto.currency,
        amountMinor,
        reason: 'DEPOSIT',
        refType: 'DEPOSIT',
        refId: depositId,
      });
    });

    return this.getBalances(clientId);
  }
}
