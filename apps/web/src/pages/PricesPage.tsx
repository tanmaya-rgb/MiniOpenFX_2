import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { PriceResponse } from '../api/types';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';

export function PricesPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [price, setPrice] = useState<PriceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.getPrice(symbol.trim().toUpperCase());
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
      <form onSubmit={lookup} className="flex gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="BTCUSDT"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm uppercase focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !symbol.trim()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {loading ? 'Loading…' : 'Get price'}
        </button>
      </form>

      <div className="mt-4 space-y-3">
        <ErrorBanner error={error} />
        {price && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Symbol</dt>
              <dd className="font-mono font-medium">{price.symbol}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Source</dt>
              <dd className="font-medium">{price.source}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Bid</dt>
              <dd className="font-mono font-medium text-red-700">{price.bid}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Ask</dt>
              <dd className="font-mono font-medium text-emerald-700">{price.ask}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">As of</dt>
              <dd>{new Date(price.timestamp).toLocaleString()}</dd>
            </div>
          </dl>
        )}
      </div>
    </Card>
  );
}
