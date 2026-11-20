import { useQuery } from '@tanstack/react-query';
import { queryKeys, type LeaderboardMetric, type LeaderboardScope } from '@dyce/shared';
import { discoveryApi } from '@/lib/api';
import { useSession } from '@/features/auth/use-session';

/** People matching what was typed. Waits for 2+ characters (the screen debounces). */
export function usePeopleSearch(q: string) {
  return useQuery({
    queryKey: queryKeys.peopleSearch(q),
    queryFn: () => discoveryApi.searchPeople(q),
    enabled: q.length >= 2,
    staleTime: 15_000,
    retry: false,
  });
}

/** Someone's profile by @username (your own works too). */
export function useUserProfileQuery(username: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile(username ?? ''),
    queryFn: () => discoveryApi.profile(username!),
    enabled: !!username,
    refetchOnMount: 'always',
    retry: false,
  });
}

export function useBadgesQuery() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  return useQuery({ queryKey: queryKeys.badges, queryFn: discoveryApi.badges, enabled: signedIn });
}

export function useLeaderboardQuery(q: {
  scope: LeaderboardScope;
  metric: LeaderboardMetric;
  game?: string;
}) {
  return useQuery({
    queryKey: queryKeys.leaderboard(q.scope, q.metric, q.game ?? 'all'),
    queryFn: () => discoveryApi.leaderboard(q),
    refetchOnMount: 'always',
  });
}
