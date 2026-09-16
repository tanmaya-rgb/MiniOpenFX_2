import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './cursor-pagination.js';

describe('cursor-pagination', () => {
  it('round-trips createdAt/id through encode -> decode', () => {
    const cursor = { createdAt: new Date('2026-01-01T00:00:00.000Z'), id: 'abc-123' };
    const decoded = decodeCursor(encodeCursor(cursor));

    expect(decoded.createdAt.toISOString()).toBe(cursor.createdAt.toISOString());
    expect(decoded.id).toBe(cursor.id);
  });

  it('produces an opaque, URL-safe string', () => {
    const encoded = encodeCursor({ createdAt: new Date(), id: 'abc' });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('rejects a cursor that is not valid base64url/JSON', () => {
    expect(() => decodeCursor('not-a-real-cursor!!!')).toThrow(BadRequestException);
  });

  it('rejects a cursor missing required fields', () => {
    const malformed = Buffer.from(JSON.stringify({ createdAt: 'not-a-date' })).toString('base64url');
    expect(() => decodeCursor(malformed)).toThrow(BadRequestException);
  });

  it('rejects a cursor with a non-string id', () => {
    const malformed = Buffer.from(
      JSON.stringify({ createdAt: new Date().toISOString(), id: 42 }),
    ).toString('base64url');
    expect(() => decodeCursor(malformed)).toThrow(BadRequestException);
  });
});
