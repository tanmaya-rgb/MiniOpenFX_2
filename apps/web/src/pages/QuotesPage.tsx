import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { BalanceResponse, QuoteResponse, TradeResponse, TradeSide } from '../api/types';
import { Card } from '../components/Card';
import { CurrencySelect } from '../components/CurrencySelect';
import { ErrorBanner } from '../components/ErrorBanner';

type ClientQuoteStatus = 'ACTIVE' | 'EXPIRED' | 'EXECUTED';

function msRemaining(expiresAt: string): number {
  return new Date(expiresAt).getTime() - Date.now();
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M7 10V5m0 0L4.5 7.5M7 5l2.5 2.5M17 14v5m0 0l2.5-2.5M17 19l-2.5-2.5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function QuotesPage() {
  const [buyCurrency, setBuyCurrency] = useState('BTC');
  const [sellCurrency, setSellCurrency] = useState('USDT');
  const [buyAmount, setBuyAmount] = useState('0.01');
  const [sellAmount, setSellAmount] = useState('');
  // Which card the user last typed an amount into — that's the side/base
  // amount that gets sent to POST /v1/quotes; the other card is filled in
  // from the response, never recomputed live.
  const [activeSide, setActiveSide] = useState<TradeSide>('BUY');

  const [balances, setBalances] = useState<BalanceResponse[] | null>(null);

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
    let ignore = false;
    api
      .getBalances()
      .then((data) => {
        if (!ignore) setBalances(data);
      })
      .catch(() => {
        // Balance line is a convenience, not load-bearing — leave it blank on failure.
      });
    return () => {
      ignore = true;
    };
  }, []);

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

  function balanceFor(currency: string): string {
    return balances?.find((b) => b.currency === currency)?.available ?? '0';
  }

  function refreshBalances() {
    api
      .getBalances()
      .then(setBalances)
      .catch(() => {
        // ignore — see mount effect comment
      });
  }

  function swap() {
    // Swapping which currency occupies which card changes which pair
    // direction/side any previously-typed amount meant, so amounts (and any
    // quote fetched for the old pair) are cleared rather than carried over —
    // the user re-enters an amount for the new pair.
    setBuyCurrency(sellCurrency);
    setSellCurrency(buyCurrency);
    setBuyAmount('');
    setSellAmount('');
    setActiveSide('BUY');
    reset();
  }

  async function createQuote(e: React.FormEvent) {
    e.preventDefault();
    const isBuy = activeSide === 'BUY';
    const baseCurrency = isBuy ? buyCurrency : sellCurrency;
    const quoteCurrency = isBuy ? sellCurrency : buyCurrency;
    const baseAmount = (isBuy ? buyAmount : sellAmount).trim();

    setCreating(true);
    setCreateError(null);
    setExecuteError(null);
    setTrade(null);
    try {
      const result = await api.createQuote({ baseCurrency, quoteCurrency, side: activeSide, baseAmount });
      setQuote(result);
      setStatus(result.status === 'EXECUTED' ? 'EXECUTED' : 'ACTIVE');
      idempotencyKeyRef.current = crypto.randomUUID();
      if (isBuy) {
        setSellAmount(result.quoteAmount);
      } else {
        setBuyAmount(result.quoteAmount);
      }
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
      refreshBalances();
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

  const sameCurrency = buyCurrency === sellCurrency;
  const activeAmount = (activeSide === 'BUY' ? buyAmount : sellAmount).trim();

  return (
    <div className="space-y-6">
      <form onSubmit={createQuote}>
        <div className="relative flex flex-col gap-3">
          <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-lg">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-emerald-400">Buy</div>
            <div className="flex items-center justify-between gap-3">
              <CurrencySelect variant="dark" value={buyCurrency} onChange={setBuyCurrency} aria-label="Buy currency" />
              <input
                value={buyAmount}
                onChange={(e) => {
                  setBuyAmount(e.target.value);
                  setActiveSide('BUY');
                }}
                inputMode="decimal"
                placeholder="0.00"
                className="w-32 flex-1 bg-transparent text-right text-2xl font-semibold text-white placeholder-slate-600 focus:outline-none"
              />
            </div>
            <div className="mt-3 text-xs text-slate-400">
              {buyCurrency} balance: <span className="font-mono">{balanceFor(buyCurrency)}</span>
            </div>
          </div>

          <div className="relative z-10 -my-5 flex justify-center">
            <button
              type="button"
              onClick={swap}
              aria-label="Swap currencies"
              className="flex h-9 w-9 items-center justify-center rounded-full border-4 border-slate-50 bg-slate-700 text-white shadow hover:bg-slate-600"
            >
              <SwapIcon />
            </button>
          </div>

          <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-lg">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-rose-400">Sell</div>
            <div className="flex items-center justify-between gap-3">
              <CurrencySelect variant="dark" value={sellCurrency} onChange={setSellCurrency} aria-label="Sell currency" />
              <input
                value={sellAmount}
                onChange={(e) => {
                  setSellAmount(e.target.value);
                  setActiveSide('SELL');
                }}
                inputMode="decimal"
                placeholder="0.00"
                className="w-32 flex-1 bg-transparent text-right text-2xl font-semibold text-white placeholder-slate-600 focus:outline-none"
              />
            </div>
            <div className="mt-3 text-xs text-slate-400">
              {sellCurrency} balance: <span className="font-mono">{balanceFor(sellCurrency)}</span>
            </div>
          </div>
        </div>

        {sameCurrency && (
          <p className="mt-3 text-sm text-amber-700">Pick two different currencies to get a quote.</p>
        )}

        <button
          type="submit"
          disabled={creating || sameCurrency || !activeAmount}
          className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {creating ? 'Creating…' : 'Get quote'}
        </button>

        <div className="mt-4">
          <ErrorBanner error={createError} />
        </div>
      </form>

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
