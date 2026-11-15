/**
 * When an access token expires (ms since epoch), read from its payload, or null if it can't be read.
 * This only decides *when to refresh*; the server is the one that actually checks the token.
 */
export function jwtExpiresAt(token: string): number | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(part.length / 4) * 4, '=');
    const payload = JSON.parse(globalThis.atob(b64)) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
