import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys, type CreateSpaceRequest, type SpaceView } from '@dyce/shared';
import { spacesApi } from '@/lib/api';
import { newerSpace } from './spaces-logic';

/** Your spaces (waiting, live, recently finished). Live `space` events keep it fresh. */
export function useSpacesQuery() {
  return useQuery({
    queryKey: queryKeys.spaces('mine'),
    queryFn: () => spacesApi.list(),
    refetchOnMount: 'always',
  });
}

/** One space you sit in. */
export function useSpaceQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.space(id),
    queryFn: () => spacesApi.get(id),
    refetchOnMount: 'always',
    enabled,
  });
}

/** What a code leads to ("Space found"). Off until the code is complete. */
export function useSpaceLookup(code: string | null) {
  return useQuery({
    queryKey: ['space-lookup', code],
    queryFn: () => spacesApi.lookup(code ?? ''),
    enabled: code !== null,
    retry: false,
    staleTime: 0,
  });
}

/** After a space changed: store it, refresh the list, and the wallet (seat fees and payouts move money). */
export function storeSpace(client: QueryClient, space: SpaceView): void {
  client.setQueryData<SpaceView>(queryKeys.space(space.id), (cached) => newerSpace(cached, space));
  void client.invalidateQueries({ queryKey: queryKeys.spaces('mine') });
  if (space.mode === 'pool') {
    void client.invalidateQueries({ queryKey: queryKeys.wallet });
    void client.invalidateQueries({ queryKey: queryKeys.poolInfo });
  }
}

function useSpaceMutation<V>(fn: (v: V) => Promise<SpaceView>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (space) => storeSpace(client, space) });
}

/** Opens a space. The caller makes the id once per attempt so a retry can't open two. */
export const useCreateSpace = () =>
  useSpaceMutation((input: CreateSpaceRequest) => spacesApi.create(input));
export const useJoinSpace = () => useSpaceMutation((code: string) => spacesApi.join(code));
export const useLeaveSpace = () => useSpaceMutation((id: string) => spacesApi.leave(id));
export const useCloseSpace = () => useSpaceMutation((id: string) => spacesApi.close(id));
export const useStartSpace = () => useSpaceMutation((id: string) => spacesApi.start(id));
export const useRemoveMember = () =>
  useSpaceMutation((v: { id: string; userId: string }) => spacesApi.remove(v.id, v.userId));
