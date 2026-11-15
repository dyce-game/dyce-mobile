import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys, type MatchView, type SubmitMoveRequest } from '@dyce/shared';
import { ApiError } from '@/features/auth/api-client';
import { gamesApi } from '@/lib/api';
import { newerMatch } from './games-logic';

/** The games on offer (the Games drawer). */
export function useGamesQuery() {
  return useQuery({
    queryKey: queryKeys.games,
    queryFn: () => gamesApi.list(),
    staleTime: 5 * 60_000,
  });
}

/** A match as you see it. Live `match` events and your own moves are merged into this cache. */
export function useMatchQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.match(id),
    queryFn: () => gamesApi.get(id),
    refetchOnMount: 'always',
  });
}

function store(client: QueryClient, match: MatchView) {
  client.setQueryData<MatchView>(queryKeys.match(match.id), (cached) => newerMatch(cached, match));
  // the card in the thread and the chat list's preview follow
  void client.invalidateQueries({ queryKey: queryKeys.conversationsAll });
}

/** Sends a game. The caller makes the id once per attempt so a retry can't send two. */
export function useCreateMatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; conversationId: string; gameSlug: string }) =>
      gamesApi.create({ ...input, mode: 'free' }),
    onSuccess: (match) => {
      store(client, match);
      if (match.conversationId) {
        void client.invalidateQueries({ queryKey: queryKeys.messages(match.conversationId) });
      }
    },
  });
}

function useAnswer(fn: (id: string) => Promise<MatchView>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (match) => store(client, match),
    onError: (err, id) => {
      // "already answered" or "no longer there": show what the server says now
      if (err instanceof ApiError && err.status !== 0) {
        void client.invalidateQueries({ queryKey: queryKeys.match(id) });
      }
    },
  });
}

export const useAcceptMatch = () => useAnswer((id) => gamesApi.accept(id));
export const useDeclineMatch = () => useAnswer((id) => gamesApi.decline(id));
export const useCancelMatch = () => useAnswer((id) => gamesApi.cancel(id));

/**
 * Plays one move. The server validates it; if the match has moved on (`stale_version`) we reload the
 * match instead of guessing. Retrying after a lost response sends the same version and is safe.
 */
export function useSubmitMove(matchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitMoveRequest) => gamesApi.move(matchId, input),
    onSuccess: (match) => store(client, match),
    onError: (err) => {
      if (err instanceof ApiError && err.status !== 0) {
        void client.invalidateQueries({ queryKey: queryKeys.match(matchId) });
      }
    },
  });
}
