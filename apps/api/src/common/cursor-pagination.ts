import { BadRequestException } from '@nestjs/common';

export interface Cursor {
  createdAt: Date;
  id: string;
}

/**
 * Keyset (createdAt, id) pagination, opaque-encoded so callers never build
 * cursors by hand. (createdAt, id) rather than createdAt alone avoids ties
 * within the same millisecond ever skipping or repeating a row.
 */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
  ).toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const createdAt = new Date(parsed.createdAt);
    if (typeof parsed.id !== 'string' || Number.isNaN(createdAt.getTime())) {
      throw new Error('malformed cursor payload');
    }
    return { createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException('cursor is invalid or malformed');
  }
}
