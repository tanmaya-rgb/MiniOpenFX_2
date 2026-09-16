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
 * Proof that lockBalanceRows() was called for this client/currency set
 * before debit()/credit() — a structural guarantee instead of a comment,
 * so a future caller can't silently skip locking and reintroduce the
 * AB-BA deadlock class described on lockBalanceRows below.
 */
export interface BalanceLock {
  readonly clientId: string;
  readonly currencies: ReadonlySet<string>;
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
   * inversion). The returned `BalanceLock` is required by debit()/credit(),
   * so it's a compile error to call either without locking first.
   */
  async lockBalanceRows(
    tx: DrizzleTx,
    clientId: string,
    currencies: string[],
  ): Promise<BalanceLock> {
    const uniqueCurrencies = [...new Set(currencies)];

    await tx
      .insert(balances)
      .values(
        uniqueCurrencies.map((currency) => ({
          clientId,
          currency,
          availableMinor: 0n,
        })),
      )
      .onConflictDoNothing({ target: [balances.clientId, balances.currency] });

    await tx
      .select()
      .from(balances)
      .where(
        and(
          eq(balances.clientId, clientId),
          inArray(balances.currency, uniqueCurrencies),
        ),
      )
      .orderBy(balances.currency)
      .for('update');

    return { clientId, currencies: new Set(uniqueCurrencies) };
  }

  async debit(
    tx: DrizzleTx,
    lock: BalanceLock,
    params: LedgerMovementParams,
  ): Promise<void> {
    const { clientId, currency, amountMinor, reason, refType, refId } = params;
    assertCovers(lock, clientId, currency);

    // The row is guaranteed locked by `lock` (see lockBalanceRows); the
    // `available_minor >= amount` guard here is defense-in-depth, not the
    // primary concurrency control.
    const [updated] = await tx
      .update(balances)
      .set({
        availableMinor: sql`${balances.availableMinor} - ${amountMinor}`,
        updatedAt: sql`now()`,
      })
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

  async credit(
    tx: DrizzleTx,
    lock: BalanceLock,
    params: LedgerMovementParams,
  ): Promise<void> {
    const { clientId, currency, amountMinor, reason, refType, refId } = params;
    assertCovers(lock, clientId, currency);

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

function assertCovers(
  lock: BalanceLock,
  clientId: string,
  currency: string,
): void {
  if (lock.clientId !== clientId || !lock.currencies.has(currency)) {
    throw new Error(
      `LedgerService: "${currency}" for client "${clientId}" was not covered by the provided lock`,
    );
  }
}
