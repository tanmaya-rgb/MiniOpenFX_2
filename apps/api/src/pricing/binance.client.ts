import { Injectable, Logger } from '@nestjs/common';

// api.binance.com 451s requests from US-hosted IPs (incl. GitHub Actions
// runners) on regulatory geo-blocking grounds. data-api.binance.vision is
// Binance's official public, geo-unrestricted mirror for read-only market
// data — identical response shapes, and this client never calls anything
// beyond public ticker/exchangeInfo endpoints.
const BINANCE_BASE_URL = 'https://data-api.binance.vision/api/v3';
const REQUEST_TIMEOUT_MS = 5000;

export interface BookTicker {
  symbol: string;
  bidPrice: string;
  askPrice: string;
}

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

interface ExchangeInfoResponse {
  symbols: SymbolInfo[];
}

export class BinanceTimeoutError extends Error {}
export class BinanceUnknownSymbolError extends Error {}
export class BinanceUnavailableError extends Error {}

function isBookTicker(body: unknown): body is BookTicker {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as BookTicker).symbol === 'string' &&
    typeof (body as BookTicker).bidPrice === 'string' &&
    typeof (body as BookTicker).askPrice === 'string'
  );
}

function isExchangeInfoResponse(body: unknown): body is ExchangeInfoResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    Array.isArray((body as ExchangeInfoResponse).symbols) &&
    (body as ExchangeInfoResponse).symbols.every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        typeof s.symbol === 'string' &&
        typeof s.baseAsset === 'string' &&
        typeof s.quoteAsset === 'string',
    )
  );
}

/**
 * Binance is the sole authority on which symbols exist and what their
 * base/quote assets are — see CLAUDE.md. We never guess a symbol's
 * base/quote split from a local currency list; getSymbolInfo() asks
 * Binance directly instead.
 */
@Injectable()
export class BinanceClient {
  private readonly logger = new Logger(BinanceClient.name);

  async getBookTicker(symbol: string): Promise<BookTicker> {
    return this.request(
      `${BINANCE_BASE_URL}/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`,
      symbol,
      isBookTicker,
    );
  }

  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    const data = await this.request(
      `${BINANCE_BASE_URL}/exchangeInfo?symbol=${encodeURIComponent(symbol)}`,
      symbol,
      isExchangeInfoResponse,
    );

    const info = data.symbols[0];
    if (!info) {
      throw new BinanceUnknownSymbolError(`Binance rejected symbol "${symbol}"`);
    }
    return info;
  }

  private async request<T>(
    url: string,
    symbol: string,
    isValidShape: (body: unknown) => body is T,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (response.status === 400) {
        throw new BinanceUnknownSymbolError(`Binance rejected symbol "${symbol}"`);
      }

      if (!response.ok) {
        throw new BinanceUnavailableError(
          `Binance responded with status ${response.status}`,
        );
      }

      const body: unknown = await response.json();
      if (!isValidShape(body)) {
        throw new BinanceUnavailableError(
          `Binance returned an unexpected response shape for "${symbol}"`,
        );
      }
      return body;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new BinanceTimeoutError(
          `Binance request for "${symbol}" timed out after ${REQUEST_TIMEOUT_MS}ms`,
        );
      }
      if (
        error instanceof BinanceUnknownSymbolError ||
        error instanceof BinanceUnavailableError
      ) {
        throw error;
      }

      this.logger.error(`Failed to reach Binance for "${symbol}"`, error as Error);
      throw new BinanceUnavailableError('Failed to reach Binance');
    } finally {
      clearTimeout(timeout);
    }
  }
}
