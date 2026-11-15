import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { queryKeys, type HistoryFilter } from '@dyce/shared';
import { walletApi } from '@/lib/api';

export const walletRequestsKey = ['wallet', 'requests'] as const;

/** Balance, free top-up availability and limits. */
export function useWalletQuery() {
  return useQuery({
    queryKey: queryKeys.wallet,
    queryFn: walletApi.summary,
    refetchOnMount: 'always',
  });
}

/** History, newest first, one page at a time. */
export function useHistoryQuery(filter: HistoryFilter) {
  return useInfiniteQuery({
    queryKey: queryKeys.walletHistory(filter),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => walletApi.history(filter, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnMount: 'always',
  });
}

/** The last 7 days (History bars, Top-up week grid). */
export function useWeeklyQuery() {
  return useQuery({
    queryKey: [...queryKeys.wallet, 'weekly'],
    queryFn: walletApi.weekly,
    refetchOnMount: 'always',
  });
}

export function useReceiptQuery(txnId: string) {
  return useQuery({ queryKey: queryKeys.receipt(txnId), queryFn: () => walletApi.receipt(txnId) });
}

export function useMyRequestsQuery() {
  return useQuery({ queryKey: walletRequestsKey, queryFn: walletApi.requests });
}

/**
 * A request as the server sees it. With `watch`, it re-checks every few seconds so the person showing a QR
 * code sees it turn "Paid" without doing anything.
 */
export function useRequestQuery(code: string, opts: { watch?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.paymentRequest(code),
    queryFn: () => walletApi.request(code),
    refetchInterval: opts.watch ? 3_000 : false,
    refetchOnMount: 'always',
  });
}

/** After money moves: balance, history, requests, and the chat cards all change. */
function refreshMoney(client: QueryClient) {
  void client.invalidateQueries({ queryKey: queryKeys.wallet });
  void client.invalidateQueries({ queryKey: queryKeys.conversationsAll });
  void client.invalidateQueries({ queryKey: ['messages'] });
}

export function useSendMoney() {
  const client = useQueryClient();
  return useMutation({ mutationFn: walletApi.send, onSuccess: () => refreshMoney(client) });
}

export function useClaimTopup() {
  const client = useQueryClient();
  return useMutation({ mutationFn: walletApi.topup, onSuccess: () => refreshMoney(client) });
}

export function useCreateRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: walletApi.createRequest,
    onSuccess: (view) => {
      client.setQueryData(queryKeys.paymentRequest(view.code), view);
      refreshMoney(client);
    },
  });
}

export function usePayRequest(code: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof walletApi.pay>[1]) => walletApi.pay(code, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.paymentRequest(code) });
      refreshMoney(client);
    },
  });
}

export function useCancelRequest(code: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => walletApi.cancel(code),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.paymentRequest(code) });
      refreshMoney(client);
    },
  });
}
