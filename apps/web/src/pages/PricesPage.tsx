import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { PriceResponse } from '../api/types';
import { Card } from '../components/Card';
import { CurrencySelect } from '../components/CurrencySelect';
import { ErrorBanner } from '../components/ErrorBanner';

export function PricesPage() {
  const [baseCurrency, setBaseCurrency] = useState('BTC');
  const [quoteCurrency, setQuoteCurrency] = useState('USDT');
  const [price, setPrice] = useState<PriceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  const sameCurrency = baseCurrency === quoteCurrency;

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.getPrice(baseCurrency.toUpperCase(), quoteCurrency.toUpperCase());
      setPrice(result);
    } catch (err) {
      setPrice(null);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Indicative Prices">
      <form onSubmit={lookup} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Base currency
          <CurrencySelect value={baseCurrency} onChange={setBaseCurrency} aria-label="Base currency" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Quote currency
          <CurrencySelect value={quoteCurrency} onChange={setQuoteCurrency} aria-label="Quote currency" />
        </label>
        <button
          type="submit"
          disabled={loading || sameCurrency}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {loading ? 'Loading…' : 'Get price'}
        </button>
      </form>

      {sameCurrency && (
        <p className="mt-3 text-sm text-amber-700">Pick two different currencies to look up a price.</p>
      )}

      <div className="mt-4 space-y-3">
        <ErrorBanner error={error} />
        {price && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-red-600">Sell price</div>
                <div className="mt-1 font-mono text-lg font-semibold text-red-800">{price.bid}</div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-emerald-600">Buy price</div>
                <div className="mt-1 font-mono text-lg font-semibold text-emerald-800">{price.ask}</div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Symbol</dt>
                <dd className="font-mono font-medium">{price.symbol}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Source</dt>
                <dd className="font-medium">{price.source}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500">As of</dt>
                <dd>{new Date(price.timestamp).toLocaleString()}</dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </Card>
  );
}
