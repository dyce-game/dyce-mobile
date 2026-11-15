import { SignJWT, jwtVerify } from 'jose';
import { AuthError } from './auth-error.ts';

export type Clock = () => Date;

export type AccessClaims = { userId: string; familyId: string };

export type TokenConfig = {
  accessTtlSeconds: number;
  issuer?: string;
  audience?: string;
};

const DEFAULTS = { issuer: 'dyce-api', audience: 'dyce' } as const;

/**
 * Short-lived HS256 access tokens. The same secret lets Colyseus verify them (see `verifyAccess`).
 * `sid` is the refresh-token family, so a stolen session can be revoked server-side.
 */
export class TokenService {
  private readonly key: Uint8Array;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly accessTtlSeconds: number;
  private readonly clock: Clock;

  constructor(secret: string, config: TokenConfig, clock: Clock = () => new Date()) {
    if (secret.length < 32) throw new Error('JWT secret must be at least 32 characters');
    this.key = new TextEncoder().encode(secret);
    this.issuer = config.issuer ?? DEFAULTS.issuer;
    this.audience = config.audience ?? DEFAULTS.audience;
    this.accessTtlSeconds = config.accessTtlSeconds;
    this.clock = clock;
  }

  get expiresIn(): number {
    return this.accessTtlSeconds;
  }

  async signAccess(claims: AccessClaims): Promise<string> {
    const iat = Math.floor(this.clock().getTime() / 1000);
    return new SignJWT({ sid: claims.familyId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt(iat)
      .setExpirationTime(iat + this.accessTtlSeconds)
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const { userId, familyId } = await this.verifyAccessWithExpiry(token);
    return { userId, familyId };
  }

  /** Same as `verifyAccess`, plus when the token stops being valid (ms since epoch). Long-lived sockets use it. */
  async verifyAccessWithExpiry(token: string): Promise<AccessClaims & { expiresAt: number }> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'], // never accept "none" or an asymmetric alg
        issuer: this.issuer,
        audience: this.audience,
        currentDate: this.clock(),
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new Error('missing claims');
      }
      if (typeof payload.exp !== 'number') throw new Error('missing exp');
      return { userId: payload.sub, familyId: payload.sid, expiresAt: payload.exp * 1000 };
    } catch {
      throw new AuthError('unauthorized');
    }
  }
}
