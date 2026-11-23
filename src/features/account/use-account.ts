import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, type CreateDisputeRequest } from '@dyce/shared';
import { accountApi } from '@/lib/api';

/** What deleting would do to you, and whether a request is waiting out its grace period. */
export function useDeletionQuery() {
  return useQuery({
    queryKey: queryKeys.deletion,
    queryFn: () => accountApi.deletion(),
    refetchOnMount: 'always',
  });
}

export function useRequestDeletion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => accountApi.requestDeletion(username),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.deletion }),
  });
}

export function useCancelDeletion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => accountApi.cancelDeletion(),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.deletion }),
  });
}

/** Fetches the export on demand (a button), never in the background. */
export function useExportData() {
  return useMutation({ mutationFn: () => accountApi.exportData() });
}

/** Where a Pool result stands for you. */
export function useDisputeQuery(matchId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dispute(matchId),
    queryFn: () => accountApi.dispute(matchId),
    enabled,
    refetchOnMount: 'always',
  });
}

export function useOpenDispute(matchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDisputeRequest) => accountApi.openDispute(matchId, input),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.dispute(matchId) }),
  });
}
