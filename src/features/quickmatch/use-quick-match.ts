import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  type QuickMatchState,
  type QuickMatchTicket,
  type StartQuickMatchRequest,
} from '@dyce/shared';
import { quickMatchApi } from '@/lib/api';
import { isOpen } from './quick-match-logic';

/** While a search is open the app also asks every 1.5 s, in case a live event was missed. */
const POLL_MS = 1500;

/** Your open search (or the one that just ended) and the games you can quick match. */
export function useQuickMatchQuery() {
  return useQuery({
    queryKey: queryKeys.quickMatch,
    queryFn: () => quickMatchApi.state(),
    refetchOnMount: 'always',
    refetchInterval: (query) => (isOpen(query.state.data?.ticket) ? POLL_MS : false),
  });
}

/** A ticket changed (a mutation answered, or a live `quick_match` event): keep the cached state in step. */
export function storeTicket(client: QueryClient, ticket: QuickMatchTicket): void {
  client.setQueryData<QuickMatchState>(queryKeys.quickMatch, (cached) => ({
    games: cached?.games ?? [],
    ticket,
  }));
  if (movesMoney(ticket)) void client.invalidateQueries({ queryKey: queryKeys.wallet });
}

/** Pool stakes move into the pot when a match is found and back when it falls through. */
const movesMoney = (t: QuickMatchTicket): boolean => t.mode === 'pool';

function useTicketMutation<V>(fn: (v: V) => Promise<QuickMatchTicket>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (ticket) => storeTicket(client, ticket) });
}

export const useJoinQuickMatch = () =>
  useTicketMutation((input: StartQuickMatchRequest) => quickMatchApi.join(input));
export const useCancelQuickMatch = () =>
  useTicketMutation((id: string) => quickMatchApi.cancel(id));
export const useAcceptQuickMatch = () =>
  useTicketMutation((id: string) => quickMatchApi.accept(id));
export const useDeclineQuickMatch = () =>
  useTicketMutation((id: string) => quickMatchApi.decline(id));
