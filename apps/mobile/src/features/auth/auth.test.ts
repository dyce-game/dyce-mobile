import type { SessionResponse } from '@dyce/shared';
import { ApiError, createApiClient, type Tokens } from './api-client';
import { authErrorMessage } from './messages';
import { hrefForStep } from './routes';
import { createSessionStore, type KeyValueStorage } from './session-store';

function memoryStorage(
  initial: Record<string, string> = {},
): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (k) => data[k] ?? null,
    setItem: async (k, v) => void (data[k] = v),
    removeItem: async (k) => void delete data[k],
  };
}

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

const session: SessionResponse = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresIn: 900,
  userId: 'user-1',
  isNewUser: true,
  nextStep: 'username',
};

describe('api client', () => {
  function setup(
    handler: (url: string, init: RequestInit) => Response | Promise<Response>,
    tokens: Tokens | null = { accessToken: 'a1', refreshToken: 'r1' },
  ) {
    let current = tokens;
    const calls: { url: string; method: string; auth: string | null }[] = [];
    const signedOut = jest.fn();
    const fetchImpl = (async (url: string, init: RequestInit = {}) => {
      const auth = ((init.headers ?? {}) as Record<string, string>).authorization ?? null;
      calls.push({ url, method: init.method ?? 'GET', auth });
      return handler(url, init);
    }) as typeof fetch;
    const client = createApiClient({
      baseUrl: 'http://api',
      getTokens: () => current,
      setTokens: (t) => void (current = t),
      onSignedOut: signedOut,
      fetchImpl,
    });
    return { client, calls, signedOut, tokens: () => current };
  }

  it('sends the bearer token and parses JSON', async () => {
    const { client, calls } = setup(() => json({ ok: true }));
    expect(await client.get('/me')).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ url: 'http://api/me', auth: 'Bearer a1' });
  });

  it('does not send a token when auth is off (sign-in endpoints)', async () => {
    const { client, calls } = setup(() => json({ ok: true }));
    await client.post('/auth/otp/request', { phone: 'x' }, { auth: false });
    expect(calls[0]!.auth).toBeNull();
  });

  it('turns error bodies into ApiError with the server code and details', async () => {
    const { client } = setup(() =>
      json({ code: 'otp_invalid', message: 'x', attemptsRemaining: 3 }, 400),
    );
    const err = await client.post('/auth/otp/verify', {}, { auth: false }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      code: 'otp_invalid',
      details: { attemptsRemaining: 3 },
    });
  });

  it('handles 204 and non-JSON error bodies', async () => {
    expect(
      await setup(() => json(undefined, 204)).client.post('/auth/logout', {}, { auth: false }),
    ).toBeUndefined();
    const err = await setup(() => new Response('<html>bad gateway</html>', { status: 502 }))
      .client.get('/me')
      .catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: 'unknown' });
  });

  it('reports an unreachable server as code "network" without touching the session', async () => {
    const { client, tokens, signedOut } = setup(() => {
      throw new TypeError('Network request failed');
    });
    await expect(client.get('/me')).rejects.toMatchObject({ code: 'network', status: 0 });
    expect(tokens()).not.toBeNull();
    expect(signedOut).not.toHaveBeenCalled();
  });

  it('on 401 refreshes once, stores the new pair, and retries the request', async () => {
    let meCalls = 0;
    const { client, calls, tokens } = setup((url) => {
      if (url.endsWith('/auth/refresh'))
        return json({ accessToken: 'a2', refreshToken: 'r2', expiresIn: 900 });
      return ++meCalls === 1 ? json({ code: 'unauthorized' }, 401) : json({ me: true });
    });
    expect(await client.get('/me')).toEqual({ me: true });
    expect(tokens()).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
    expect(calls.map((c) => c.auth)).toEqual(['Bearer a1', null, 'Bearer a2']);
  });

  it('concurrent 401s share ONE refresh call (replaying a refresh token would sign the user out)', async () => {
    let refreshCalls = 0;
    const { client, tokens } = setup((url, init) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        return new Promise((resolve) =>
          setTimeout(() => resolve(json({ accessToken: 'a2', refreshToken: 'r2' })), 20),
        );
      }
      const auth = ((init.headers ?? {}) as Record<string, string>).authorization;
      return auth === 'Bearer a2' ? json({ ok: true }) : json({ code: 'unauthorized' }, 401);
    });
    const results = await Promise.all([
      client.get('/a'),
      client.get('/b'),
      client.get('/c'),
      client.get('/d'),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
    expect(tokens()?.refreshToken).toBe('r2');
  });

  it('signs the user out and clears tokens when the refresh token is rejected', async () => {
    const { client, tokens, signedOut } = setup((url) =>
      url.endsWith('/auth/refresh')
        ? json({ code: 'refresh_reused' }, 401)
        : json({ code: 'unauthorized' }, 401),
    );
    await expect(client.get('/me')).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(tokens()).toBeNull();
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the refresh fails only because the network dropped', async () => {
    const { client, tokens, signedOut } = setup((url) => {
      if (url.endsWith('/auth/refresh')) throw new TypeError('offline');
      return json({ code: 'unauthorized' }, 401);
    });
    await expect(client.get('/me')).rejects.toBeTruthy();
    expect(tokens()).not.toBeNull();
    expect(signedOut).not.toHaveBeenCalled();
  });

  it('does not try to refresh when signed out, and does not loop on a second 401', async () => {
    const none = setup(() => json({ code: 'unauthorized' }, 401), null);
    await expect(none.client.get('/me')).rejects.toMatchObject({ status: 401 });
    expect(none.calls).toHaveLength(1);

    let refreshes = 0;
    const loop = setup((url) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes++;
        return json({ accessToken: 'a2', refreshToken: 'r2' });
      }
      return json({ code: 'unauthorized' }, 401); // still 401 after refreshing
    });
    await expect(loop.client.get('/me')).rejects.toMatchObject({ status: 401 });
    expect(refreshes).toBe(1);
  });
});

describe('session store', () => {
  it('starts in "loading" and restores a saved session', async () => {
    const storage = memoryStorage();
    const first = createSessionStore(storage);
    expect(first.getState().status).toBe('loading');
    await first.getState().signIn(session);

    const second = createSessionStore(storage); // a fresh app launch
    await second.getState().restore();
    expect(second.getState()).toMatchObject({
      status: 'signedIn',
      userId: 'user-1',
      nextStep: 'username',
      tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
    });
  });

  it('is signed out when nothing (or garbage) is stored', async () => {
    const empty = createSessionStore(memoryStorage());
    await empty.getState().restore();
    expect(empty.getState().status).toBe('signedOut');

    const corrupt = createSessionStore(memoryStorage({ 'dyce.session.v1': '{not json' }));
    await corrupt.getState().restore();
    expect(corrupt.getState().status).toBe('signedOut');

    const partial = createSessionStore(
      memoryStorage({ 'dyce.session.v1': JSON.stringify({ userId: 'u' }) }),
    );
    await partial.getState().restore();
    expect(partial.getState().status).toBe('signedOut');
  });

  it('stores only tokens, user id and step: never a phone number or profile data', async () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    await store.getState().signIn(session);
    expect(Object.keys(JSON.parse(storage.data['dyce.session.v1']!)).sort()).toEqual([
      'nextStep',
      'tokens',
      'userId',
    ]);
  });

  it('persists rotated tokens and step changes', async () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    await store.getState().signIn(session);
    await store.getState().setTokens({ accessToken: 'a2', refreshToken: 'r2' });
    store.getState().setNextStep('contacts');
    await Promise.resolve();
    const saved = JSON.parse(storage.data['dyce.session.v1']!);
    expect(saved.tokens).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
    expect(saved.nextStep).toBe('contacts');
  });

  it('sign out clears memory and storage; setTokens(null) is a sign out', async () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    await store.getState().signIn(session);
    await store.getState().signOut();
    expect(store.getState()).toMatchObject({ status: 'signedOut', tokens: null, userId: null });
    expect(storage.data['dyce.session.v1']).toBeUndefined();

    await store.getState().signIn(session);
    await store.getState().setTokens(null);
    expect(store.getState().status).toBe('signedOut');
    expect(storage.data['dyce.session.v1']).toBeUndefined();
  });
});

describe('hrefForStep', () => {
  it.each([
    ['username', '/username'],
    ['contacts', '/onboarding/contacts'],
    ['avatar', '/onboarding/avatar'],
    ['bonus', '/onboarding/bonus'],
    ['notifications', '/onboarding/notifications'],
    ['done', '/chat'],
    [null, '/chat'],
  ] as const)('%s -> %s', (step, href) => {
    expect(hrefForStep(step)).toBe(href);
  });
});

describe('authErrorMessage', () => {
  const e = (code: string, details: Record<string, unknown> = {}) =>
    authErrorMessage(new ApiError(400, code, details));
  it('has friendly copy with the useful numbers', () => {
    expect(e('otp_invalid', { attemptsRemaining: 3 })).toBe("That code isn't right. 3 tries left.");
    expect(e('otp_invalid', { attemptsRemaining: 1 })).toBe("That code isn't right. 1 try left.");
    expect(e('otp_resend_too_soon', { retryAfterSeconds: 20 })).toContain('20s');
    expect(e('otp_rate_limited', { retryAfterSeconds: 507 })).toContain('9 min');
    expect(e('network')).toContain('connection');
  });
  it('falls back safely and never exposes raw codes or stack text', () => {
    expect(e('something_new')).toBe('Something went wrong. Please try again.');
    expect(authErrorMessage(new Error('boom at line 5'))).toBe(
      'Something went wrong. Please try again.',
    );
    expect(authErrorMessage('weird')).not.toContain('weird');
  });
});
