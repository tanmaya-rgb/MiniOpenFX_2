import { NotFoundException } from '@nestjs/common';

/**
 * Every quote/trade/balance row is scoped to a client_id (see CLAUDE.md).
 * A row that exists but belongs to a different client must 404 exactly
 * like a row that doesn't exist at all — never leak existence via a 403.
 */
export function assertOwnedByClient<T extends { clientId: string }>(
  row: T | null | undefined,
  clientId: string,
  message: string,
): T {
  if (!row || row.clientId !== clientId) {
    throw new NotFoundException(message);
  }
  return row;
}
