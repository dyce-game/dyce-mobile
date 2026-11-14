export type Tokens = { accessToken: string; refreshToken: string };

/** A failed API call. `code` is the server's typed error code (e.g. "otp_invalid"); "network" if unreachable. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, details: Record<string, unknown> = {}) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type ApiClientDeps = {
  baseUrl: string;
  getTokens: () => Tokens | null;
  /** Called after a refresh succeeds (store the new pair) or with null when the session is dead. */
  setTokens: (tokens: Tokens | null) => void | Promise<void>;
  /** Called when the server says the session is over (refresh rejected). */
  onSignedOut?: () => void;
  fetchImpl?: typeof fetch;
};

type RequestOptions = { body?: unknown; auth?: boolean };

/**
 * JSON API client with automatic, single-flight token refresh.
 *
 * Single-flight matters: the server treats a replayed refresh token as theft and revokes the whole
 * session. If three requests 401 at once and each refreshed, two would replay the token and sign the
 * user out. So all concurrent 401s share one refresh call.
 */
export function createApiClient(deps: ApiClientDeps) {
  const doFetch = deps.fetchImpl ?? fetch;
  let refreshing: Promise<boolean> | null = null;

  async function send(
    method: string,
    path: string,
    body: unknown,
    token: string | null,
  ): Promise<Response> {
    try {
      return await doFetch(`${deps.baseUrl}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'network');
    }
  }

  async function parse(res: Response): Promise<unknown> {
    if (res.status === 204) return undefined;
    const text = await res.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  /** Returns true if a fresh token pair is now stored. Network failure keeps the session (offline is not logout). */
  function refreshOnce(): Promise<boolean> {
    refreshing ??= (async () => {
      const tokens = deps.getTokens();
      if (!tokens) return false;
      const res = await send('POST', '/auth/refresh', { refreshToken: tokens.refreshToken }, null);
      if (res.ok) {
        const next = (await parse(res)) as { accessToken: string; refreshToken: string };
        await deps.setTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken });
        return true;
      }
      if (res.status === 401 || res.status === 403) {
        await deps.setTokens(null);
        deps.onSignedOut?.();
      }
      return false;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const useAuth = options.auth !== false;
    let res = await send(
      method,
      path,
      options.body,
      useAuth ? (deps.getTokens()?.accessToken ?? null) : null,
    );

    if (res.status === 401 && useAuth && deps.getTokens()) {
      if (await refreshOnce()) {
        res = await send(method, path, options.body, deps.getTokens()?.accessToken ?? null);
      }
    }

    const json = await parse(res);
    if (!res.ok) {
      const data = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
      const { code, ...rest } = data;
      throw new ApiError(res.status, typeof code === 'string' ? code : 'unknown', rest);
    }
    return json as T;
  }

  return {
    get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
    post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
      request<T>('POST', path, { ...options, body }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
