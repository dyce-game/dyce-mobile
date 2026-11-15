import type {
  ContactsMatchResponse,
  ContactSuggestionsResponse,
  PublicUser,
  Relationship,
} from '@dyce/shared';
import type { ApiClient } from '../auth/api-client';

/** Typed wrappers over the contacts / friends / users endpoints of apps/api. */
export function createContactsApi(api: ApiClient) {
  return {
    /** One batch (at most 500 E.164 numbers). Numbers are sent over TLS and never stored by the server. */
    match: (numbers: string[]) => api.post<ContactsMatchResponse>('/contacts/match', { numbers }),
    suggestions: () => api.get<ContactSuggestionsResponse>('/contacts/suggestions'),
    /** Forget what the server stored from this user's address book. */
    clear: () => api.delete<void>('/contacts'),
    /** Send a friend request, or accept one that is waiting. */
    addFriend: (userId: string) =>
      api.post<{ relationship: Relationship }>('/friends/requests', { userId }),
    findByUsername: (username: string) =>
      api.get<PublicUser>(`/users/by-username/${encodeURIComponent(username)}`),
  };
}

export type ContactsApi = ReturnType<typeof createContactsApi>;
