import { useEffect, useState } from 'react';
import { api } from './api/client';
import { BalancesPage } from './pages/BalancesPage';
import { PricesPage } from './pages/PricesPage';
import { QuotesPage } from './pages/QuotesPage';
import { TradeHistoryPage } from './pages/TradeHistoryPage';

const TABS = [
  { key: 'prices', label: 'Prices', render: () => <PricesPage /> },
  { key: 'quotes', label: 'Quote & Trade', render: () => <QuotesPage /> },
  { key: 'balances', label: 'Balances', render: () => <BalancesPage /> },
  { key: 'history', label: 'Trade History', render: () => <TradeHistoryPage /> },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function HealthBadge() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .getHealth()
      .then((h) => setOk(h.status === 'ok' && h.postgres && h.redis))
      .catch(() => setOk(false));
  }, []);

  const label = ok === null ? 'Checking…' : ok ? 'API online' : 'API unavailable';
  const dotColor = ok === null ? 'bg-slate-400' : ok ? 'bg-emerald-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      {label}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabKey>('prices');
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">MiniOpenFX</h1>
          <p className="text-sm text-slate-500">FX quoting and trading demo</p>
        </div>
        <HealthBadge />
      </header>

      <nav className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? 'border-b-2 border-slate-900 text-slate-900'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>{active.render()}</main>
    </div>
  );
}
