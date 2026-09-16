export type TradeSide = 'BUY' | 'SELL';
export type QuoteDisplayStatus = 'ACTIVE' | 'EXECUTED' | 'EXPIRED';
export type TradeStatus = 'FILLED' | 'REJECTED';

export interface HealthResponse {
  status: 'ok';
  postgres: boolean;
  redis: boolean;
}

export interface PriceResponse {
  symbol: string;
  bid: string;
  ask: string;
  timestamp: number;
  source: string;
}

export interface QuoteResponse {
  id: string;
  symbol: string;
  side: TradeSide;
  baseCurrency: string;
  quoteCurrency: string;
  baseAmount: string;
  price: string;
  quoteAmount: string;
  status: QuoteDisplayStatus;
  expiresAt: string;
  createdAt: string;
}

export interface TradeResponse {
  id: string;
  quoteId: string;
  symbol: string;
  side: TradeSide;
  baseCurrency: string;
  quoteCurrency: string;
  baseAmount: string;
  quoteAmount: string;
  price: string;
  status: TradeStatus;
  createdAt: string;
}

export interface BalanceResponse {
  currency: string;
  available: string;
}

export interface TradeHistoryPage {
  trades: TradeResponse[];
  nextCursor: string | null;
}

export interface CreateQuoteRequest {
  symbol: string;
  side: TradeSide;
  baseAmount: string;
  ttlSeconds: number;
}

export interface CreateDepositRequest {
  currency: string;
  amount: string;
}
