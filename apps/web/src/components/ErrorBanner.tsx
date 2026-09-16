import type { ApiError } from '../api/client';

export function ErrorBanner({ error }: { error: ApiError | Error | null }) {
  if (!error) return null;

  const code = 'code' in error ? error.code : undefined;

  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      {code && <span className="mr-2 font-mono text-xs font-semibold text-red-600">{code}</span>}
      {error.message}
    </div>
  );
}
