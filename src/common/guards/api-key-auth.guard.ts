import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { DRIZZLE, type DrizzleDb } from '../../db/drizzle.module.js';
import { clients } from '../../db/schema.js';

export interface AuthenticatedRequest extends Request {
  clientId: string;
}

/**
 * Minimal Bearer-token auth against the single seeded client (see
 * db/seed.ts). A real multi-tenant system would look the key up by an
 * indexed identifier instead of comparing against every row; with exactly
 * one seeded client that's out of scope here (see README trade-offs).
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }
    const apiKey = authHeader.slice('Bearer '.length).trim();

    const allClients = await this.db.select().from(clients);
    for (const client of allClients) {
      if (await bcrypt.compare(apiKey, client.apiKeyHash)) {
        request.clientId = client.id;
        return true;
      }
    }

    throw new UnauthorizedException('Invalid API key');
  }
}
