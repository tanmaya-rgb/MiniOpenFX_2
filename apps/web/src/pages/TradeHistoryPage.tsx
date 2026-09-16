import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { TradeResponse } from '../api/types';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';

export function TradeHistoryPage() {
  const [trades, setTrades] = useState<TradeResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const page = await api.getTrades({ limit: 20, cursor: reset ? undefined : (cursor ?? undefined) });
      setTrades((prev) => (reset ? page.trades : [...prev, ...page.trades]));
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }

  useEffect(() => {
    void load(true);
  }, []);

  return (
    <Card title="Trade History">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">Newest trades first.</p>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      <ErrorBanner error={error} />

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-2 font-medium">When</th>
            <th className="py-2 font-medium">Symbol</th>
            <th className="py-2 font-medium">Side</th>
            <th className="py-2 font-medium">Base</th>
            <th className="py-2 font-medium">Quote</th>
            <th className="py-2 font-medium">Price</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2 text-slate-500">{new Date(t.createdAt).toLocaleString()}</td>
              <td className="py-2 font-mono font-medium">{t.symbol}</td>
              <td className="py-2">{t.side}</td>
              <td className="py-2 font-mono">
                {t.baseAmount} {t.baseCurrency}
              </td>
              <td className="py-2 font-mono">
                {t.quoteAmount} {t.quoteCurrency}
              </td>
              <td className="py-2 font-mono">{t.price}</td>
              <td className="py-2">{t.status}</td>
            </tr>
          ))}
          {hasLoaded && trades.length === 0 && (
            <tr>
              <td colSpan={7} className="py-4 text-center text-slate-400">
                No trades yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {cursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void load(false)}
            disabled={loading}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </Card>
  );
}
