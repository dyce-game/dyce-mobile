import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AuthError } from '../auth/auth-error.ts';

/** Validates and transforms request input with a shared zod schema; failures are typed 422s. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AuthError('validation_failed', {
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
