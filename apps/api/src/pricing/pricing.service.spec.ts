import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  BinanceTimeoutError,
  BinanceUnavailableError,
  BinanceUnknownSymbolError,
  type BinanceClient,
} from './binance.client.js';
import { PricingService } from './pricing.service.js';
import type { RedisService } from '../redis/redis.service.js';

function makeService() {
  const getBookTicker = vi.fn();
  const getSymbolInfo = vi.fn();
  const binanceClient = {
    getBookTicker,
    getSymbolInfo,
  } as unknown as BinanceClient;

  const getJson = vi.fn().mockResolvedValue(null);
  const setJson = vi.fn().mockResolvedValue(undefined);
  const del = vi.fn().mockResolvedValue(undefined);
  const redis = { getJson, setJson, del } as unknown as RedisService;

  const config = {
    get: vi.fn().mockReturnValue(1500),
  } as unknown as ConfigService;

  const service = new PricingService(binanceClient, redis, config);
  return { service, getBookTicker, getSymbolInfo, getJson, setJson };
}

describe('PricingService.getPrice — cache-aside', () => {
  it('calls Binance and caches the result on a cache miss', async () => {
    const { service, getBookTicker, setJson } = makeService();
    getBookTicker.mockResolvedValueOnce({
      symbol: 'BTCUSDT',
      bidPrice: '67123.45',
      askPrice: '67125.10',
    });

    const result = await service.getPrice('btcusdt');

    expect(getBookTicker).toHaveBeenCalledWith('BTCUSDT');
    expect(result).toMatchObject({
      symbol: 'BTCUSDT',
      bid: '67123.45',
      ask: '67125.10',
      source: 'binance',
    });
    expect(setJson).toHaveBeenCalledWith(
      'price:BTCUSDT',
      expect.objectContaining({ symbol: 'BTCUSDT' }),
      1500,
    );
  });

  it('returns the cached value and never calls Binance on a cache hit', async () => {
    const { service, getBookTicker, getJson } = makeService();
    const cached = {
      symbol: 'BTCUSDT',
      bid: '1',
      ask: '2',
      timestamp: 123,
      source: 'binance' as const,
    };
    getJson.mockResolvedValueOnce(cached);

    const result = await service.getPrice('BTCUSDT');

    expect(result).toEqual(cached);
    expect(getBookTicker).not.toHaveBeenCalled();
  });

  it('normalizes case/whitespace before calling Binance or the cache', async () => {
    const { service, getBookTicker, getJson } = makeService();
    getBookTicker.mockResolvedValueOnce({
      symbol: 'BTCUSDT',
      bidPrice: '1',
      askPrice: '2',
    });

    await service.getPrice('  btcusdt  ');

    expect(getJson).toHaveBeenCalledWith('price:BTCUSDT');
    expect(getBookTicker).toHaveBeenCalledWith('BTCUSDT');
  });

  it('maps BinanceUnknownSymbolError to a 400', async () => {
    const { service, getBookTicker } = makeService();
    getBookTicker.mockRejectedValueOnce(new BinanceUnknownSymbolError('nope'));

    await expect(service.getPrice('ZZZUSDT')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('maps BinanceTimeoutError to a 504', async () => {
    const { service, getBookTicker } = makeService();
    getBookTicker.mockRejectedValueOnce(new BinanceTimeoutError('slow'));

    await expect(service.getPrice('BTCUSDT')).rejects.toThrow(
      GatewayTimeoutException,
    );
  });

  it('maps BinanceUnavailableError to a 502', async () => {
    const { service, getBookTicker } = makeService();
    getBookTicker.mockRejectedValueOnce(new BinanceUnavailableError('down'));

    await expect(service.getPrice('BTCUSDT')).rejects.toThrow(
      BadGatewayException,
    );
  });

  it('does not cache a failed lookup', async () => {
    const { service, getBookTicker, setJson } = makeService();
    getBookTicker.mockRejectedValueOnce(new BinanceUnavailableError('down'));

    await expect(service.getPrice('BTCUSDT')).rejects.toThrow();
    expect(setJson).not.toHaveBeenCalled();
  });
});

describe('PricingService.getSymbolBreakdown — cache-aside with its own TTL/prefix', () => {
  it('calls Binance exchangeInfo and caches with a 24h TTL, separate from the price cache', async () => {
    const { service, getSymbolInfo, setJson } = makeService();
    getSymbolInfo.mockResolvedValueOnce({
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
    });

    const result = await service.getSymbolBreakdown('btcusdt');

    expect(result).toEqual({ baseCurrency: 'BTC', quoteCurrency: 'USDT' });
    expect(setJson).toHaveBeenCalledWith(
      'symbol:BTCUSDT',
      { baseCurrency: 'BTC', quoteCurrency: 'USDT' },
      24 * 60 * 60 * 1000,
    );
  });

  it('returns the cached breakdown and never calls Binance on a cache hit', async () => {
    const { service, getSymbolInfo, getJson } = makeService();
    getJson.mockResolvedValueOnce({
      baseCurrency: 'BTC',
      quoteCurrency: 'USDT',
    });

    const result = await service.getSymbolBreakdown('BTCUSDT');

    expect(result).toEqual({ baseCurrency: 'BTC', quoteCurrency: 'USDT' });
    expect(getSymbolInfo).not.toHaveBeenCalled();
  });

  it('maps an unknown symbol to a 400, same as getPrice', async () => {
    const { service, getSymbolInfo } = makeService();
    getSymbolInfo.mockRejectedValueOnce(new BinanceUnknownSymbolError('nope'));

    await expect(service.getSymbolBreakdown('ZZZUSDT')).rejects.toThrow(
      BadRequestException,
    );
  });
});
