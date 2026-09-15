import { Injectable, Logger } from '@nestjs/common';

const BINANCE_BOOK_TICKER_URL = 'https://api.binance.com/api/v3/ticker/bookTicker';
const REQUEST_TIMEOUT_MS = 5000;

export interface BookTicker {
  symbol: string;
  bidPrice: string;
  askPrice: string;
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

@Injectable()
export class BinanceClient {
  private readonly logger = new Logger(BinanceClient.name);

  async getBookTicker(symbol: string): Promise<BookTicker> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${BINANCE_BOOK_TICKER_URL}?symbol=${encodeURIComponent(symbol)}`,
        { signal: controller.signal },
      );

      if (response.status === 400) {
        throw new BinanceUnknownSymbolError(`Binance rejected symbol "${symbol}"`);
      }

      if (!response.ok) {
        throw new BinanceUnavailableError(
          `Binance responded with status ${response.status}`,
        );
      }

      const body: unknown = await response.json();
      if (!isBookTicker(body)) {
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

      this.logger.error(`Failed to fetch price for "${symbol}"`, error as Error);
      throw new BinanceUnavailableError('Failed to reach Binance');
    } finally {
      clearTimeout(timeout);
    }
  }
}
