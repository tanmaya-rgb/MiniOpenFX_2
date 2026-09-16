import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { eq } from 'drizzle-orm';
import { assertOwnedByClient } from '../common/assert-owned-by-client.js';
import { DRIZZLE, type DrizzleDb } from '../db/drizzle.module.js';
import { quotes } from '../db/schema.js';
import { fromMinorUnits, roundToMinorUnits, toMinorUnits } from '../domain/money.js';
import { PricingService } from '../pricing/pricing.service.js';
import { RedisService } from '../redis/redis.service.js';
import type { CreateQuoteDto } from './dto/create-quote.dto.js';
import {
  deserializeQuote,
  quoteCacheKey,
  serializeQuote,
  toQuoteResponse,
  type QuoteResponse,
  type QuoteRow,
} from './quote.mapper.js';

@Injectable()
export class QuotingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly pricingService: PricingService,
    private readonly redis: RedisService,
  ) {}

  async createQuote(clientId: string, dto: CreateQuoteDto): Promise<QuoteResponse> {
    let baseAmountMinor: bigint;
    try {
      baseAmountMinor = toMinorUnits(dto.baseAmount);
    } catch {
      throw new BadRequestException(
        `baseAmount must not have more than 8 decimal places`,
      );
    }
    if (baseAmountMinor <= 0n) {
      throw new BadRequestException('baseAmount must be greater than zero');
    }

    // Binance is the sole authority on both symbol validity and its
    // base/quote breakdown (see CLAUDE.md) — never guess from a local list.
    const [breakdown, indicativePrice] = await Promise.all([
      this.pricingService.getSymbolBreakdown(dto.symbol),
      this.pricingService.getPrice(dto.symbol),
    ]);

    // BUY: client pays quote currency to acquire base, at the (higher) ask.
    // SELL: client gives up base currency, at the (lower) bid.
    const price = dto.side === 'BUY' ? indicativePrice.ask : indicativePrice.bid;

    // Round in the house's favor: what a client owes rounds up, what a
    // client receives rounds down, so fractional minor units never leak.
    const rawQuoteAmount = fromMinorUnits(baseAmountMinor).mul(price);
    const quoteAmountMinor = roundToMinorUnits(
      rawQuoteAmount,
      dto.side === 'BUY' ? Decimal.ROUND_UP : Decimal.ROUND_DOWN,
    );
    if (quoteAmountMinor <= 0n) {
      throw new BadRequestException(
        'baseAmount is too small: it rounds down to a zero quote amount at the current price',
      );
    }

    const expiresAt = new Date(Date.now() + dto.ttlSeconds * 1000);

    const [row] = (await this.db
      .insert(quotes)
      .values({
        clientId,
        symbol: dto.symbol,
        side: dto.side,
        baseCurrency: breakdown.baseCurrency,
        quoteCurrency: breakdown.quoteCurrency,
        baseAmountMinor,
        price,
        quoteAmountMinor,
        status: 'ACTIVE',
        expiresAt,
      })
      .returning()) as QuoteRow[];

    await this.redis.setJson(quoteCacheKey(row.id), serializeQuote(row), dto.ttlSeconds * 1000);

    return toQuoteResponse(row);
  }

  async getQuoteById(clientId: string, id: string): Promise<QuoteResponse> {
    const row = await this.loadQuote(id);
    return toQuoteResponse(assertOwnedByClient(row, clientId, `Quote "${id}" not found`));
  }

  /** Called by the trading service once a quote transitions to EXECUTED. */
  async invalidateCache(id: string): Promise<void> {
    await this.redis.del(quoteCacheKey(id));
  }

  private async loadQuote(id: string): Promise<QuoteRow | null> {
    const cached = await this.redis.getJson<ReturnType<typeof serializeQuote>>(
      quoteCacheKey(id),
    );
    if (cached) {
      return deserializeQuote(cached);
    }

    const [row] = (await this.db
      .select()
      .from(quotes)
      .where(eq(quotes.id, id))
      .limit(1)) as QuoteRow[];

    if (row) {
      const remainingMs = row.expiresAt.getTime() - Date.now();
      if (remainingMs > 0) {
        await this.redis.setJson(quoteCacheKey(id), serializeQuote(row), remainingMs);
      }
    }

    return row ?? null;
  }
}
