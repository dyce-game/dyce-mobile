import { createApiClient } from '@/features/auth/api-client';
import { createAccountApi } from '@/features/account/account-api';
import { createAuthApi } from '@/features/auth/auth-api';
import { createSessionStore } from '@/features/auth/session-store';
import { jwtExpiresAt } from '@/features/auth/jwt';
import { createChatApi } from '@/features/chat/chat-api';
import { createContactsApi } from '@/features/contacts/contacts-api';
import { createFriendsApi } from '@/features/friends/friends-api';
import { createDiscoveryApi } from '@/features/discovery/discovery-api';
import { createGamesApi } from '@/features/games/games-api';
import { createInvitesApi } from '@/features/invites/invites-api';
import { createNotificationsApi } from '@/features/notifications/notifications-api';
import { createSafetyApi } from '@/features/safety/safety-api';
import { createQuickMatchApi } from '@/features/quickmatch/quick-match-api';
import { createSpacesApi } from '@/features/spaces/spaces-api';
import { createWalletApi } from '@/features/wallet/wallet-api';
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
export const contactsApi = createContactsApi(api);
export const friendsApi = createFriendsApi(api);
export const chatApi = createChatApi(api);
export const walletApi = createWalletApi(api);
export const gamesApi = createGamesApi(api);
export const safetyApi = createSafetyApi(api);
export const spacesApi = createSpacesApi(api);
export const quickMatchApi = createQuickMatchApi(api);
export const discoveryApi = createDiscoveryApi(api);
export const notificationsApi = createNotificationsApi(api);
export const invitesApi = createInvitesApi(api, config.apiUrl);
export const accountApi = createAccountApi(api);

/**
 * An access token that is good for at least another minute, refreshing first if it isn't. Used before
 * opening the live connection. Offline, it returns whatever we have rather than signing anyone out.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const tokens = sessionStore.getState().tokens;
  if (!tokens) return null;
  const expiresAt = jwtExpiresAt(tokens.accessToken);
  if (expiresAt !== null && expiresAt - Date.now() > 60_000) return tokens.accessToken;
  await api.refresh();
  return sessionStore.getState().tokens?.accessToken ?? null;
}
