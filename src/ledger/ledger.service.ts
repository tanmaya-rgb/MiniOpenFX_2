import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { DrizzleTx } from '../db/drizzle.module.js';
import { balances, ledgerEntries, type LedgerReason } from '../db/schema.js';

export interface LedgerMovementParams {
  clientId: string;
  currency: string;
  amountMinor: bigint;
  reason: LedgerReason;
  refType: string;
  refId: string;
}

/**
 * Money-movement mechanics shared by anything that debits/credits a
 * client's balance. Every call MUST run inside the caller's transaction
 * (via `tx`) so a trade's balance updates and ledger entries commit or
 * roll back together — see CLAUDE.md's ledger invariant.
 */
@Injectable()
export class LedgerService {
  /**
   * Ensures a balance row exists for every given currency (Postgres can't
   * lock a row that doesn't exist yet), then locks all of them in one
   * statement in a single canonical (sorted) order. Callers that touch more
   * than one currency for the same client — e.g. a trade's debit + credit
   * legs — MUST lock them together via this method rather than locking
   * each individually, or two transactions touching the same currency pair
   * in opposite debit/credit roles can deadlock on each other (AB-BA lock
   * inversion).
   */
  async lockBalanceRows(tx: DrizzleTx, clientId: string, currencies: string[]): Promise<void> {
    const uniqueCurrencies = [...new Set(currencies)];

    for (const currency of uniqueCurrencies) {
      await tx
        .insert(balances)
        .values({ clientId, currency, availableMinor: 0n })
        .onConflictDoNothing({ target: [balances.clientId, balances.currency] });
    }

    await tx
      .select()
      .from(balances)
      .where(and(eq(balances.clientId, clientId), inArray(balances.currency, uniqueCurrencies)))
      .orderBy(balances.currency)
      .for('update');
  }

  async debit(tx: DrizzleTx, params: LedgerMovementParams): Promise<void> {
    const { clientId, currency, amountMinor, reason, refType, refId } = params;

    // The row is expected to already be locked (via lockBalanceRows) by the
    // caller before calling debit(); the `available_minor >= amount` guard
    // here is defense-in-depth, not the primary concurrency control.
    const [updated] = await tx
      .update(balances)
      .set({ availableMinor: sql`${balances.availableMinor} - ${amountMinor}`, updatedAt: sql`now()` })
      .where(
        and(
          eq(balances.clientId, clientId),
          eq(balances.currency, currency),
          gte(balances.availableMinor, amountMinor),
        ),
      )
      .returning();

    if (!updated) {
      throw new UnprocessableEntityException(
        `Insufficient ${currency} balance for client`,
      );
    }

    await tx.insert(ledgerEntries).values({
      clientId,
      currency,
      deltaMinor: -amountMinor,
      reason,
      refType,
      refId,
    });
  }

  async credit(tx: DrizzleTx, params: LedgerMovementParams): Promise<void> {
    const { clientId, currency, amountMinor, reason, refType, refId } = params;

    await tx
      .insert(balances)
      .values({ clientId, currency, availableMinor: amountMinor })
      .onConflictDoUpdate({
        target: [balances.clientId, balances.currency],
        set: {
          availableMinor: sql`${balances.availableMinor} + ${amountMinor}`,
          updatedAt: sql`now()`,
        },
      });

    await tx.insert(ledgerEntries).values({
      clientId,
      currency,
      deltaMinor: amountMinor,
      reason,
      refType,
      refId,
    });
  }
}
