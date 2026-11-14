import {
  Inject,
  Injectable,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthError } from './auth-error.ts';
import { TokenService } from './tokens.ts';

export type AuthContext = { userId: string; familyId: string };
type AuthedRequest = Request & { auth?: AuthContext };

/** Requires `Authorization: Bearer <access token>`. Stores the verified identity on the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const match = header ? /^Bearer (.+)$/i.exec(header) : null;
    if (!match) throw new AuthError('unauthorized');
    req.auth = await this.tokens.verifyAccess(match[1]!);
    return true;
  }
}

/** Injects the authenticated user: `me(@CurrentUser() user: AuthContext)`. Use behind AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) throw new AuthError('unauthorized');
    return req.auth;
  },
);
