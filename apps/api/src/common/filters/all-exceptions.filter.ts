import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Every error response — from a validation failure to an unhandled
 * exception — is normalized to one shape: {error: {code, message}}. See
 * CLAUDE.md's status code conventions for what each status means.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorEnvelope = {
      error: {
        code: codeForStatus(status),
        message: extractMessage(exception, status),
      },
    };

    response.status(status).json(body);
  }
}

function codeForStatus(status: number): string {
  const text = STATUS_CODES[status] ?? 'Internal Server Error';
  return text.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function extractMessage(exception: unknown, status: number): string {
  if (exception instanceof HttpException) {
    const body = exception.getResponse();
    if (typeof body === 'string') {
      return body;
    }
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (Array.isArray(message)) {
        return message.join('; ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }
    return exception.message;
  }

  // Never leak an unexpected error's internal details to the client.
  return status >= 500 ? 'Internal server error' : 'Unexpected error';
}
