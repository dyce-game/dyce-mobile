import { createApiClient } from '@/features/auth/api-client';
import { createAuthApi } from '@/features/auth/auth-api';
import { createSessionStore } from '@/features/auth/session-store';
import { config } from './config';
import { secureStorage } from './storage';

/** One session store and one API client for the whole app. */
export const sessionStore = createSessionStore(secureStorage);

export const api = createApiClient({
  baseUrl: config.apiUrl,
  getTokens: () => sessionStore.getState().tokens,
  setTokens: (tokens) => sessionStore.getState().setTokens(tokens),
});

export const authApi = createAuthApi(api);
