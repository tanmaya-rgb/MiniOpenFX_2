import { formatMinorUnits } from '../domain/money.js';

export interface BalanceRow {
  currency: string;
  availableMinor: bigint;
}

export interface BalanceResponse {
  currency: string;
  available: string;
}

export function toBalanceResponse(row: BalanceRow): BalanceResponse {
  return {
    currency: row.currency,
    available: formatMinorUnits(row.availableMinor),
  };
}
