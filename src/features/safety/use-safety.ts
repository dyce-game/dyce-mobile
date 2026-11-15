import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@dyce/shared';
import { safetyApi } from '@/lib/api';

/** People you've blocked, most recent first. */
export function useBlockedQuery() {
  return useQuery({
    queryKey: queryKeys.blocks,
    queryFn: safetyApi.blocked,
    refetchOnMount: 'always',
  });
}

/** Blocking and unblocking change who you see everywhere: lists, chats, friends, requests. */
function refreshEverything(client: QueryClient) {
  void client.invalidateQueries({ queryKey: queryKeys.blocks });
  void client.invalidateQueries({ queryKey: queryKeys.conversationsAll });
  void client.invalidateQueries({ queryKey: queryKeys.friends });
  void client.invalidateQueries({ queryKey: ['messages'] });
  void client.invalidateQueries({ queryKey: queryKeys.contactSuggestions });
}

export function useBlockUser() {
  const client = useQueryClient();
  return useMutation({ mutationFn: safetyApi.block, onSuccess: () => refreshEverything(client) });
}

export function useUnblockUser() {
  const client = useQueryClient();
  return useMutation({ mutationFn: safetyApi.unblock, onSuccess: () => refreshEverything(client) });
}

export function useReportUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: safetyApi.report,
    // a report can also block: refresh whatever that changes
    onSuccess: (result) => {
      if (result.blocked) refreshEverything(client);
    },
  });
}
