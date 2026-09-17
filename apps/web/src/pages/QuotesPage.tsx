import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { QuoteResponse, TradeResponse, TradeSide } from '../api/types';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';

type ClientQuoteStatus = 'ACTIVE' | 'EXPIRED' | 'EXECUTED';

function msRemaining(expiresAt: string): number {
  return new Date(expiresAt).getTime() - Date.now();
}

export function QuotesPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [side, setSide] = useState<TradeSide>('BUY');
  const [baseAmount, setBaseAmount] = useState('0.01');

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [status, setStatus] = useState<ClientQuoteStatus>('ACTIVE');
  const [remainingMs, setRemainingMs] = useState(0);
  const [trade, setTrade] = useState<TradeResponse | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [createError, setCreateError] = useState<ApiError | Error | null>(null);
  const [executeError, setExecuteError] = useState<ApiError | Error | null>(null);

  useEffect(() => {
    if (!quote || status !== 'ACTIVE') return;
    const tick = () => {
      const ms = msRemaining(quote.expiresAt);
      setRemainingMs(ms);
      if (ms <= 0) {
        setStatus('EXPIRED');
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [quote, status]);

  async function createQuote(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setExecuteError(null);
    setTrade(null);
    try {
      const result = await api.createQuote({
        symbol: symbol.trim().toUpperCase(),
        side,
        baseAmount: baseAmount.trim(),
      });
      setQuote(result);
      setStatus(result.status === 'EXECUTED' ? 'EXECUTED' : 'ACTIVE');
      idempotencyKeyRef.current = crypto.randomUUID();
    } catch (err) {
      setCreateError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setCreating(false);
    }
  }

  async function executeTrade() {
    if (!quote || !idempotencyKeyRef.current) return;
    setExecuting(true);
    setExecuteError(null);
    try {
      const result = await api.createTrade(quote.id, idempotencyKeyRef.current);
      setTrade(result);
      setStatus('EXECUTED');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 410) setStatus('EXPIRED');
        if (err.status === 409) setStatus('EXECUTED');
      }
      setExecuteError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setExecuting(false);
    }
  }

  function reset() {
    setQuote(null);
    setTrade(null);
    setCreateError(null);
    setExecuteError(null);
    idempotencyKeyRef.current = null;
  }

  return (
    <div className="space-y-6">
      <Card title="New Quote">
        <form onSubmit={createQuote} className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <label className="col-span-1 flex flex-col gap-1 text-sm">
            Symbol
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 uppercase focus:border-slate-500 focus:outline-none"
            />
          </label>
          <label className="col-span-1 flex flex-col gap-1 text-sm">
            Side
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as TradeSide)}
              className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            >
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </label>
          <label className="col-span-1 flex flex-col gap-1 text-sm">
            Base amount
            <input
              value={baseAmount}
              onChange={(e) => setBaseAmount(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            />
          </label>
          <div className="col-span-2 sm:col-span-3">
            <button
              type="submit"
              disabled={creating || !symbol.trim() || !baseAmount.trim()}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {creating ? 'Creating…' : 'Get quote'}
            </button>
          </div>
        </form>
        <div className="mt-4">
          <ErrorBanner error={createError} />
        </div>
      </Card>

      {quote && (
        <Card title="Active Quote">
          <div className="flex items-start justify-between gap-4">
            <dl className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">Symbol</dt>
                <dd className="font-mono font-medium">{quote.symbol}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Side</dt>
                <dd className="font-medium">{quote.side}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <StatusPill status={status} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Pay</dt>
                <dd className="font-mono font-medium">
                  {quote.side === 'BUY' ? `${quote.quoteAmount} ${quote.quoteCurrency}` : `${quote.baseAmount} ${quote.baseCurrency}`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Receive</dt>
                <dd className="font-mono font-medium">
                  {quote.side === 'BUY' ? `${quote.baseAmount} ${quote.baseCurrency}` : `${quote.quoteAmount} ${quote.quoteCurrency}`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Price</dt>
                <dd className="font-mono font-medium">{quote.price}</dd>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-slate-500">Time remaining</dt>
                <dd className="font-mono font-medium">
                  {status === 'ACTIVE' ? `${Math.max(0, Math.ceil(remainingMs / 1000))}s` : '—'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={executeTrade}
              disabled={status !== 'ACTIVE' || executing}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {executing ? 'Executing…' : 'Execute trade'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              New quote
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <ErrorBanner error={executeError} />
            {trade && (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Trade executed: {trade.baseAmount} {trade.baseCurrency} @ {trade.price} (trade id{' '}
                <span className="font-mono">{trade.id}</span>)
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ClientQuoteStatus }) {
  const styles: Record<ClientQuoteStatus, string> = {
    ACTIVE: 'bg-blue-100 text-blue-800',
    EXPIRED: 'bg-slate-200 text-slate-600',
    EXECUTED: 'bg-emerald-100 text-emerald-800',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}
