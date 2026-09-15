import { ConflictException, GoneException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { assertOwnedByClient } from '../common/assert-owned-by-client.js';
import { DRIZZLE, type DrizzleDb, type DrizzleTx } from '../db/drizzle.module.js';
import { quotes, trades } from '../db/schema.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { QuotingService } from '../quoting/quoting.service.js';
import type { CreateTradeDto } from './dto/create-trade.dto.js';
import { toTradeResponse, type TradeResponse, type TradeRow } from './trade.mapper.js';

const IDEMPOTENCY_KEY_UNIQUE_CONSTRAINT = 'trades_client_idempotency_key_unique';
const QUOTE_ID_UNIQUE_CONSTRAINT = 'trades_quote_id_unique';

export interface TradeResult {
  trade: TradeResponse;
  /** true if this call returned a previously-executed trade rather than creating a new one. */
  replayed: boolean;
}

@Injectable()
export class TradingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly ledger: LedgerService,
    private readonly quotingService: QuotingService,
  ) {}

  async executeTrade(
    clientId: string,
    dto: CreateTradeDto,
    rawIdempotencyKey: string,
  ): Promise<TradeResult> {
    // Whitespace differences must never turn a safe retry into a new
    // execution attempt, so the key is normalized once, here, and that
    // normalized value is the only one ever stored or looked up.
    const idempotencyKey = rawIdempotencyKey.trim();

    const existing = await this.findByIdempotencyKey(clientId, idempotencyKey);
    if (existing) {
      return this.replayOrConflict(existing, dto.quoteId);
    }

    let row: TradeRow;
    try {
      row = await this.db.transaction((tx) =>
        this.executeWithinTransaction(tx, clientId, dto.quoteId, idempotencyKey),
      );
    } catch (error) {
      if (isUniqueViolation(error, IDEMPOTENCY_KEY_UNIQUE_CONSTRAINT)) {
        // Lost a race with a concurrent request using the same key.
        const raced = await this.findByIdempotencyKey(clientId, idempotencyKey);
        if (raced) {
          return this.replayOrConflict(raced, dto.quoteId);
        }
      }
      if (isUniqueViolation(error, QUOTE_ID_UNIQUE_CONSTRAINT)) {
        throw new ConflictException(`Quote "${dto.quoteId}" has already been executed`);
      }
      throw error;
    }

    // The quote is now EXECUTED; a cached ACTIVE copy must not outlive that.
    await this.quotingService.invalidateCache(dto.quoteId);

    return { trade: toTradeResponse(row), replayed: false };
  }

  private replayOrConflict(existing: TradeRow, requestedQuoteId: string): TradeResult {
    if (existing.quoteId !== requestedQuoteId) {
      throw new ConflictException(
        'Idempotency-Key was already used to execute a different quote',
      );
    }
    return { trade: toTradeResponse(existing), replayed: true };
  }

  private async executeWithinTransaction(
    tx: DrizzleTx,
    clientId: string,
    quoteId: string,
    idempotencyKey: string,
  ): Promise<TradeRow> {
    const [quoteRow] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for('update');
    const quote = assertOwnedByClient(quoteRow, clientId, `Quote "${quoteId}" not found`);

    if (quote.status === 'EXECUTED') {
      throw new ConflictException(`Quote "${quoteId}" has already been executed`);
    }
    if (Date.now() >= quote.expiresAt.getTime()) {
      throw new GoneException(`Quote "${quoteId}" has expired`);
    }

    // BUY: client owes quoteCurrency, receives baseCurrency. SELL: reversed.
    const debitCurrency = quote.side === 'BUY' ? quote.quoteCurrency : quote.baseCurrency;
    const debitAmount = quote.side === 'BUY' ? quote.quoteAmountMinor : quote.baseAmountMinor;
    const creditCurrency = quote.side === 'BUY' ? quote.baseCurrency : quote.quoteCurrency;
    const creditAmount = quote.side === 'BUY' ? quote.baseAmountMinor : quote.quoteAmountMinor;

    // Lock both balance rows together, in one canonically-ordered
    // statement — see LedgerService.lockBalanceRows for why this must not
    // be split into two separate locks (AB-BA deadlock risk). The returned
    // lock is required by debit()/credit() below, so skipping this step
    // is a compile error, not just a documented convention.
    const lock = await this.ledger.lockBalanceRows(tx, clientId, [debitCurrency, creditCurrency]);

    const tradeId = uuidv4();

    await this.ledger.debit(tx, lock, {
      clientId,
      currency: debitCurrency,
      amountMinor: debitAmount,
      reason: 'TRADE',
      refType: 'TRADE',
      refId: tradeId,
    });
    await this.ledger.credit(tx, lock, {
      clientId,
      currency: creditCurrency,
      amountMinor: creditAmount,
      reason: 'TRADE',
      refType: 'TRADE',
      refId: tradeId,
    });

    const [trade] = (await tx
      .insert(trades)
      .values({
        id: tradeId,
        clientId,
        quoteId: quote.id,
        symbol: quote.symbol,
        side: quote.side,
        baseCurrency: quote.baseCurrency,
        quoteCurrency: quote.quoteCurrency,
        baseAmountMinor: quote.baseAmountMinor,
        quoteAmountMinor: quote.quoteAmountMinor,
        price: quote.price,
        status: 'FILLED',
        idempotencyKey,
      })
      .returning()) as TradeRow[];

    await tx.update(quotes).set({ status: 'EXECUTED' }).where(eq(quotes.id, quote.id));

    return trade;
  }

  private async findByIdempotencyKey(
    clientId: string,
    idempotencyKey: string,
  ): Promise<TradeRow | null> {
    const [row] = (await this.db
      .select()
      .from(trades)
      .where(and(eq(trades.clientId, clientId), eq(trades.idempotencyKey, idempotencyKey)))
      .limit(1)) as TradeRow[];

    return row ?? null;
  }
}

function isUniqueViolation(error: unknown, constraintName: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === '23505' &&
    (error as { constraint?: string }).constraint === constraintName
  );
}
