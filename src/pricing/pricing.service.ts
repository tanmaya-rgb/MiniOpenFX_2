import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service.js';
import {
  BinanceClient,
  BinanceTimeoutError,
  BinanceUnavailableError,
  BinanceUnknownSymbolError,
} from './binance.client.js';

export interface IndicativePrice {
  symbol: string;
  bid: string;
  ask: string;
  timestamp: number;
  source: 'binance';
}

const CACHE_KEY_PREFIX = 'price:';

/**
 * Binance is the sole authority on which symbols exist. We only normalize
 * case/whitespace here — we never pre-reject a symbol against a local
 * allow-list, since that list would inevitably drift from what Binance
 * actually supports and could reject perfectly valid pairs.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly binanceClient: BinanceClient,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async getPrice(rawSymbol: string): Promise<IndicativePrice> {
    const symbol = rawSymbol.trim().toUpperCase();

    const cacheKey = `${CACHE_KEY_PREFIX}${symbol}`;
    const cached = await this.redis.getJson<IndicativePrice>(cacheKey);
    if (cached) {
      return cached;
    }

    const price = await this.fetchAndNormalize(symbol);

    const ttlMs = this.config.get<number>('PRICE_CACHE_TTL_MS')!;
    await this.redis.setJson(cacheKey, price, ttlMs);

    return price;
  }

  private async fetchAndNormalize(symbol: string): Promise<IndicativePrice> {
    try {
      const ticker = await this.binanceClient.getBookTicker(symbol);
      return {
        symbol,
        bid: ticker.bidPrice,
        ask: ticker.askPrice,
        timestamp: Date.now(),
        source: 'binance',
      };
    } catch (error) {
      if (error instanceof BinanceUnknownSymbolError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof BinanceTimeoutError) {
        throw new GatewayTimeoutException(error.message);
      }
      if (error instanceof BinanceUnavailableError) {
        throw new BadGatewayException(error.message);
      }
      throw error;
    }
  }
}
