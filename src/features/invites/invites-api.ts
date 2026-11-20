import type {
  ClaimInviteResponse,
  CreatedInvite,
  CreateInviteRequest,
  GuestSession,
  InvitePublic,
  InvitesResponse,
} from '@dyce/shared';
import { ApiError, type ApiClient } from '../auth/api-client';

/**
 * Typed wrappers over the invite endpoints of dyce-backend (apps/api). The landing page and the guest game
 * are public: a guest has no account, so their calls carry the secret of their run instead of a session.
 */
export function createInvitesApi(api: ApiClient, baseUrl: string) {
  /** Guest calls: `Authorization: Bearer <guest token>`, same error shape as the signed-in client. */
  async function guestCall<T>(path: string, guestToken: string | null, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(guestToken ? { authorization: `Bearer ${guestToken}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'network');
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const data = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
      const { code, ...rest } = data;
      throw new ApiError(res.status, typeof code === 'string' ? code : 'unknown', rest);
    }
    return json as T;
  }

  const enc = encodeURIComponent;
  return {
    /** Texts a game invite to a number from your contacts. */
    create: (input: CreateInviteRequest) => api.post<CreatedInvite>('/invites', input),
    list: () => api.get<InvitesResponse>('/invites'),
    /** After sign-up: joins every invite sent to this account's number. Safe to repeat. */
    claim: (token?: string) => api.post<ClaimInviteResponse>('/invites/claim', { token }),
    /** The landing page's data. Public. */
    get: (token: string) => api.get<InvitePublic>(`/invites/${enc(token)}`, { auth: false }),
    startGuest: (token: string, guestToken?: string | null) =>
      guestCall<GuestSession>(`/invites/${enc(token)}/guest`, guestToken ?? null),
    guestMove: (token: string, guestToken: string, action: unknown) =>
      guestCall<GuestSession>(`/invites/${enc(token)}/guest/move`, guestToken, { action }),
  };
}

export type InvitesApi = ReturnType<typeof createInvitesApi>;
