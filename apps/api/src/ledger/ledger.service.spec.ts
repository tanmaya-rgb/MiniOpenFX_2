import { UnprocessableEntityException } from '@nestjs/common';
import type { DrizzleTx } from '../db/drizzle.module.js';
import { LedgerService, type BalanceLock } from './ledger.service.js';

/**
 * A minimal stand-in for Drizzle's chainable query builder. Every method
 * returns itself so calls can be chained in any order the real code uses.
 * `await`ing the chain directly (without an explicit `.returning()` call,
 * as `credit()`/the ledger-entry insert do) just resolves to the plain
 * chain object per normal JS `await` semantics — good enough since those
 * call sites never use the resolved value.
 */
function makeChain(returning: unknown[] = []) {
  const chain: any = {};
  const self = () => chain;
  chain.values = vi.fn(self);
  chain.set = vi.fn(self);
  chain.where = vi.fn(self);
  chain.orderBy = vi.fn(self);
  chain.onConflictDoNothing = vi.fn(self);
  chain.onConflictDoUpdate = vi.fn(self);
  chain.for = vi.fn().mockResolvedValue(undefined);
  chain.returning = vi.fn().mockResolvedValue(returning);
  return chain;
}

function makeTx(updateReturning: unknown[]) {
  const insert = vi.fn().mockReturnValue(makeChain([]));
  const update = vi.fn().mockReturnValue(makeChain(updateReturning));
  const select = vi.fn().mockReturnValue(makeChain([]));
  return { insert, update, select } as unknown as DrizzleTx;
}

/** A tx that throws if touched at all — proves a guard short-circuits before any query runs. */
function makeUntouchableTx(): DrizzleTx {
  const fail = () => {
    throw new Error('tx should not have been touched');
  };
  return { insert: fail, update: fail, select: fail } as unknown as DrizzleTx;
}

describe('LedgerService — BalanceLock coverage guard', () => {
  const service = new LedgerService();

  it('debit() throws (and never touches tx) when the lock does not cover the currency', async () => {
    const lock: BalanceLock = { clientId: 'client-1', currencies: new Set(['USDT']) };
    await expect(
      service.debit(makeUntouchableTx(), lock, {
        clientId: 'client-1',
        currency: 'BTC', // not covered by the lock
        amountMinor: 1n,
        reason: 'TRADE',
        refType: 'TRADE',
        refId: 'ref-1',
      }),
    ).rejects.toThrow(/not covered by the provided lock/);
  });

  it('debit() throws when the lock covers the currency but for a different client', async () => {
    const lock: BalanceLock = { clientId: 'someone-else', currencies: new Set(['USDT']) };
    await expect(
      service.debit(makeUntouchableTx(), lock, {
        clientId: 'client-1',
        currency: 'USDT',
        amountMinor: 1n,
        reason: 'TRADE',
        refType: 'TRADE',
        refId: 'ref-1',
      }),
    ).rejects.toThrow(/not covered by the provided lock/);
  });

  it('credit() enforces the same coverage guard', async () => {
    const lock: BalanceLock = { clientId: 'client-1', currencies: new Set(['USDT']) };
    await expect(
      service.credit(makeUntouchableTx(), lock, {
        clientId: 'client-1',
        currency: 'BTC',
        amountMinor: 1n,
        reason: 'TRADE',
        refType: 'TRADE',
        refId: 'ref-1',
      }),
    ).rejects.toThrow(/not covered by the provided lock/);
  });
});

describe('LedgerService.debit — insufficient balance', () => {
  const service = new LedgerService();
  const lock: BalanceLock = { clientId: 'client-1', currencies: new Set(['USDT']) };

  it('throws UnprocessableEntityException when the guarded UPDATE affects no row', async () => {
    // The `available_minor >= amount` WHERE guard means an insufficient
    // balance simply returns no row, not a thrown DB error.
    const tx = makeTx([]);

    await expect(
      service.debit(tx, lock, {
        clientId: 'client-1',
        currency: 'USDT',
        amountMinor: 1_000_000n,
        reason: 'TRADE',
        refType: 'TRADE',
        refId: 'ref-1',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('inserts a ledger entry when the balance UPDATE succeeds', async () => {
    const tx = makeTx([{ clientId: 'client-1', currency: 'USDT', availableMinor: 9_000_000n }]);

    await service.debit(tx, lock, {
      clientId: 'client-1',
      currency: 'USDT',
      amountMinor: 1_000_000n,
      reason: 'TRADE',
      refType: 'TRADE',
      refId: 'ref-1',
    });

    // Two inserts happen elsewhere (lockBalanceRows); here debit() itself
    // should have called tx.insert exactly once, for the ledger entry.
    expect((tx.insert as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });
});
