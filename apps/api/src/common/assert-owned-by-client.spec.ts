import { NotFoundException } from '@nestjs/common';
import { assertOwnedByClient } from './assert-owned-by-client.js';

describe('assertOwnedByClient', () => {
  it('returns the row when it belongs to the given client', () => {
    const row = { clientId: 'client-1', value: 'x' };
    expect(assertOwnedByClient(row, 'client-1', 'not found')).toBe(row);
  });

  it('throws NotFoundException when the row is null', () => {
    expect(() => assertOwnedByClient(null, 'client-1', 'not found')).toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when the row is undefined', () => {
    expect(() =>
      assertOwnedByClient(undefined, 'client-1', 'not found'),
    ).toThrow(NotFoundException);
  });

  it('throws NotFoundException (not some other error) when the row belongs to a different client', () => {
    const row = { clientId: 'someone-else', value: 'x' };
    expect(() => assertOwnedByClient(row, 'client-1', 'not found')).toThrow(
      NotFoundException,
    );
  });

  it('uses the provided message on the thrown exception', () => {
    expect(() =>
      assertOwnedByClient(null, 'client-1', 'Quote "abc" not found'),
    ).toThrow('Quote "abc" not found');
  });
});
