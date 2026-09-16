import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { BalanceResponse } from '../api/types';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';

export function BalancesPage() {
  const [balances, setBalances] = useState<BalanceResponse[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [currency, setCurrency] = useState('USDT');
  const [amount, setAmount] = useState('100');
  const [depositing, setDepositing] = useState(false);
  const [depositError, setDepositError] = useState<Error | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setBalances(await api.getBalances());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function deposit(e: React.FormEvent) {
    e.preventDefault();
    setDepositing(true);
    setDepositError(null);
    try {
      setBalances(await api.createDeposit({ currency: currency.trim().toUpperCase(), amount: amount.trim() }));
    } catch (err) {
      setDepositError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setDepositing(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card title="Balances">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">Per-currency available balance for the authenticated client.</p>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <ErrorBanner error={error} />

        {balances && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 font-medium">Currency</th>
                <th className="py-2 font-medium">Available</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.currency} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-mono font-medium">{b.currency}</td>
                  <td className="py-2 font-mono">{b.available}</td>
                </tr>
              ))}
              {balances.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-4 text-center text-slate-400">
                    No balances yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Top Up (demo-only)">
        <p className="mb-4 text-sm text-slate-500">
          There is no real funding rail in this demo — this endpoint exists only so the demo doesn't run out
          of funds.
        </p>
        <form onSubmit={deposit} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Currency
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-28 rounded-md border border-slate-300 px-3 py-2 uppercase focus:border-slate-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Amount
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-32 rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={depositing || !currency.trim() || !amount.trim()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {depositing ? 'Depositing…' : 'Deposit'}
          </button>
        </form>
        <div className="mt-4">
          <ErrorBanner error={depositError} />
        </div>
      </Card>
    </div>
  );
}
