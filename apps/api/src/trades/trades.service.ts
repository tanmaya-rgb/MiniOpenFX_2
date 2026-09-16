import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../common/cursor-pagination.js';
import { DRIZZLE, type DrizzleDb } from '../db/drizzle.module.js';
import { trades } from '../db/schema.js';
import {
  toTradeResponse,
  type TradeResponse,
  type TradeRow,
} from '../trading/trade.mapper.js';
import type { GetTradesQueryDto } from './dto/get-trades-query.dto.js';

export interface TradeHistoryPage {
  trades: TradeResponse[];
  nextCursor: string | null;
}

@Injectable()
export class TradesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async getTradeHistory(
    clientId: string,
    query: GetTradesQueryDto,
  ): Promise<TradeHistoryPage> {
    const conditions = [eq(trades.clientId, clientId)];

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      // Keyset pagination: strictly "older" than the last row of the
      // previous page, using (createdAt, id) as a tie-safe compound key.
      conditions.push(
        sql`(${trades.createdAt}, ${trades.id}) < (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id})`,
      );
    }

    // Fetch one extra row to know whether a next page exists, without a
    // separate count query.
    const rows = (await this.db
      .select()
      .from(trades)
      .where(and(...conditions))
      .orderBy(desc(trades.createdAt), desc(trades.id))
      .limit(query.limit + 1)) as TradeRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];

    return {
      trades: page.map(toTradeResponse),
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }
}
