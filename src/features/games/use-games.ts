import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  type CreateMatchRequest,
  type MatchView,
  type SubmitMoveRequest,
} from '@dyce/shared';
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
export function useMatchQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.match(id),
    queryFn: () => gamesApi.get(id),
    refetchOnMount: 'always',
    enabled,
  });
}

function store(client: QueryClient, match: MatchView) {
  client.setQueryData<MatchView>(queryKeys.match(match.id), (cached) => newerMatch(cached, match));
  // the card in the thread and the chat list's preview follow
  void client.invalidateQueries({ queryKey: queryKeys.conversationsAll });
  // (the thread's card normally follows live; this keeps it right if the connection is down)
  if (match.conversationId) {
    void client.invalidateQueries({ queryKey: queryKeys.messages(match.conversationId) });
  }
  // Pool moves money (stakes locked, refunds, payouts): the balance and today's limits follow too
  void client.invalidateQueries({ queryKey: queryKeys.wallet });
  void client.invalidateQueries({ queryKey: queryKeys.poolInfo });
}

/** Stake limits, today's Pool usage and whether the age gate was answered (the mode sheet's stake picker). */
export function usePoolInfoQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.poolInfo,
    queryFn: () => gamesApi.poolInfo(),
    staleTime: 15_000,
    refetchOnMount: 'always',
    enabled,
  });
}

/** The age gate: asked once, the first time someone picks Pool. */
export function useAgeGate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (birthYear: number) => gamesApi.ageGate(birthYear),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.poolInfo });
      void client.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

/** Sends a game. The caller makes the id once per attempt so a retry can't send two. */
export function useCreateMatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Pick<CreateMatchRequest, 'id' | 'conversationId' | 'gameSlug'> &
        Partial<Pick<CreateMatchRequest, 'mode' | 'stakeKobo' | 'allowCounter'>>,
    ) => gamesApi.create({ ...input, mode: input.mode ?? 'free' }),
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
/** The invitee's one counter-offer: a smaller stake, or 0 to play it free. */
export function useCounterMatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; stakeKobo: number }) =>
      gamesApi.counter(input.id, { stakeKobo: input.stakeKobo }),
    onSuccess: (match) => store(client, match),
    onError: (err, input) => {
      if (err instanceof ApiError && err.status !== 0) {
        void client.invalidateQueries({ queryKey: queryKeys.match(input.id) });
      }
    },
  });
}

export const useDeclineMatch = () => useAnswer((id) => gamesApi.decline(id));
export const useCancelMatch = () => useAnswer((id) => gamesApi.cancel(id));
/** Resigns a running 1v1 game (the game menu). The result screen takes over once the match is finished. */
export const useResignMatch = () => useAnswer((id) => gamesApi.resign(id));

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
