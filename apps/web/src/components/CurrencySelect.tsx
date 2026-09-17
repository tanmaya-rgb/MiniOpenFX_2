import { SUPPORTED_CURRENCIES } from '../lib/currencies';

export function CurrencySelect({
  value,
  onChange,
  variant = 'light',
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  variant?: 'light' | 'dark';
  'aria-label'?: string;
}) {
  const styles =
    variant === 'dark'
      ? 'border-slate-700 bg-slate-800 text-white focus:border-slate-500'
      : 'border-slate-300 bg-white text-slate-900 focus:border-slate-500';

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={`rounded-md border px-3 py-2 text-sm font-medium focus:outline-none ${styles}`}
    >
      {SUPPORTED_CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
