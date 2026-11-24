import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@dyce/shared';
import { streakApi } from '@/lib/api';

/** Your streak and the one that just ended and can be saved (design: StreakLost). */
export function useStreakQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.streak,
    queryFn: () => streakApi.get(),
    enabled,
    staleTime: 60_000,
  });
}

/** "Not now": the screen is not shown again for this loss. */
export function useStreakSeen() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => streakApi.seen(),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.streak }),
  });
}
