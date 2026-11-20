import type {
  BadgesResponse,
  LeaderboardMetric,
  LeaderboardResponse,
  LeaderboardScope,
  PeopleSearchResponse,
  UserProfile,
} from '@dyce/shared';
import type { ApiClient } from '../auth/api-client';

/** Search, other people's profiles, badges and leaderboards (dyce-backend apps/api/src/discovery). */
export function createDiscoveryApi(api: ApiClient) {
  return {
    searchPeople: (q: string) =>
      api.get<PeopleSearchResponse>(`/search/people?q=${encodeURIComponent(q)}`),
    profile: (username: string) =>
      api.get<UserProfile>(`/users/${encodeURIComponent(username)}/profile`),
    badges: () => api.get<BadgesResponse>('/me/badges'),
    leaderboard: (q: { scope: LeaderboardScope; metric: LeaderboardMetric; game?: string }) =>
      api.get<LeaderboardResponse>(
        `/leaderboards?scope=${q.scope}&metric=${q.metric}${q.game ? `&game=${encodeURIComponent(q.game)}` : ''}`,
      ),
  };
}

export type DiscoveryApi = ReturnType<typeof createDiscoveryApi>;
