import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthError } from '../auth/auth-error.ts';
import { DyceError, httpStatusFor } from './dyce-error.ts';

/**
 * Expected failures become typed `{ code, message, ...details }` JSON (never a 500, never a stack):
 * money/game rule violations (DyceError), auth and validation problems (AuthError), and rate limits.
 */
@Catch(DyceError, AuthError, ThrottlerException)
export class DyceErrorFilter implements ExceptionFilter {
  catch(err: DyceError | AuthError | ThrottlerException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (err instanceof AuthError) {
      const retry = err.details.retryAfterSeconds;
      if (typeof retry === 'number') res.setHeader('Retry-After', String(retry));
      res
        .status(err.status)
        .json({ code: err.code, message: err.code.replaceAll('_', ' '), ...err.details });
      return;
    }
    if (err instanceof DyceError) {
      res
        .status(httpStatusFor(err.code))
        .json({ code: err.code, message: err.code.replaceAll('_', ' ') });
      return;
    }
    res.status(429).json({ code: 'rate_limited', message: 'too many requests, slow down' });
  }
}
