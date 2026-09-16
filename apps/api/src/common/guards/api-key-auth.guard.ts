import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { DRIZZLE, type DrizzleDb } from '../../db/drizzle.module.js';
import { clients } from '../../db/schema.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

export interface AuthenticatedRequest extends Request {
  clientId: string;
}

/**
 * Minimal Bearer-token auth against the single seeded client (see
 * db/seed.ts). Applied globally (see AuthModule) — routes opt out via
 * @Public(), not by omitting a per-controller @UseGuards(). A real
 * multi-tenant system would look the key up by an indexed identifier
 * instead of comparing against every row; with exactly one seeded client
 * that's out of scope here (see README trade-offs).
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or malformed Authorization header',
      );
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
