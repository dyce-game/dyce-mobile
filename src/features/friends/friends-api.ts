import type { FriendRequestsResponse, FriendsResponse, Relationship } from '@dyce/shared';
import type { ApiClient } from '../auth/api-client';

/** Typed wrappers over the friends endpoints of dyce-backend (apps/api). */
export function createFriendsApi(api: ApiClient) {
  return {
    list: () => api.get<FriendsResponse>('/friends'),
    requests: () => api.get<FriendRequestsResponse>('/friends/requests'),
    accept: (userId: string) =>
      api.post<{ relationship: Relationship }>(`/friends/requests/${userId}/accept`),
    /** "Ignore": hides the request; the sender is not told. */
    ignore: (userId: string) =>
      api.post<{ relationship: Relationship }>(`/friends/requests/${userId}/decline`),
    /** Withdraw a request you sent. */
    cancel: (userId: string) => api.delete<void>(`/friends/requests/${userId}`),
    remove: (userId: string) => api.delete<void>(`/friends/${userId}`),
  };
}

export type FriendsApi = ReturnType<typeof createFriendsApi>;
