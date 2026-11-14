import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DyceError, httpStatusFor } from './dyce-error.ts';

/** Money/game rule violations become typed `{ code, message }` JSON (never a 500). */
@Catch(DyceError)
export class DyceErrorFilter implements ExceptionFilter {
  catch(err: DyceError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res
      .status(httpStatusFor(err.code))
      .json({ code: err.code, message: err.code.replaceAll('_', ' ') });
  }
}
