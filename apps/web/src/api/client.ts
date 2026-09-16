import type {
  BalanceResponse,
  CreateDepositRequest,
  CreateQuoteRequest,
  HealthResponse,
  PriceResponse,
  QuoteResponse,
  TradeHistoryPage,
  TradeResponse,
} from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const API_KEY = import.meta.env.VITE_API_KEY;

/**
 * Thrown for every non-2xx response, with {code, message} parsed from the
 * backend's {error: {code, message}} envelope (see AllExceptionsFilter).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, headers = {}, auth = true } = options;

  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const finalHeaders: Record<string, string> = { ...headers };
  if (auth) {
    finalHeaders.Authorization = `Bearer ${API_KEY}`;
  }
  if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the API. Is it running?');
  }

  const text = await response.text();
  const json: unknown = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const envelope = json as { error?: { code?: string; message?: string } } | undefined;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'UNKNOWN_ERROR',
      envelope?.error?.message ?? `Request failed with status ${response.status}`,
    );
  }

  return json as T;
}

export const api = {
  getHealth: () => request<HealthResponse>('/v1/health', { auth: false }),

  getPrice: (symbol: string) =>
    request<PriceResponse>('/v1/prices', { query: { symbol } }),

  createQuote: (body: CreateQuoteRequest) =>
    request<QuoteResponse>('/v1/quotes', { method: 'POST', body }),

  getQuote: (id: string) => request<QuoteResponse>(`/v1/quotes/${id}`),

  createTrade: (quoteId: string, idempotencyKey: string) =>
    request<TradeResponse>('/v1/trades', {
      method: 'POST',
      body: { quoteId },
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  getBalances: () => request<BalanceResponse[]>('/v1/balances'),

  createDeposit: (body: CreateDepositRequest) =>
    request<BalanceResponse[]>('/v1/deposits', { method: 'POST', body }),

  getTrades: (params: { limit?: number; cursor?: string } = {}) =>
    request<TradeHistoryPage>('/v1/trades', { query: params }),
};
