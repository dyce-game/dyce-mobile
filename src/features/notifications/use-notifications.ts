import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  type MarkReadRequest,
  type NotificationFilter,
  type NotificationPrefsUpdate,
} from '@dyce/shared';
import { useSession } from '@/features/auth/use-session';
import { notificationsApi } from '@/lib/api';

/** The number on the bell and on the header avatar. Live: the server pushes a `notification` event. */
export function useUnreadCount(): number {
  const signedIn = useSession((s) => s.status === 'signedIn');
  const q = useQuery({
    queryKey: queryKeys.notificationUnread,
    queryFn: notificationsApi.unread,
    enabled: signedIn,
    staleTime: 20_000,
  });
  return q.data?.unread ?? 0;
}

/** The list, newest first, a page at a time. */
export function useNotificationsQuery(filter: NotificationFilter) {
  return useInfiniteQuery({
    queryKey: queryKeys.notificationList(filter),
    queryFn: ({ pageParam }) => notificationsApi.list(filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnMount: 'always',
  });
}

export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: MarkReadRequest) => notificationsApi.markRead(body),
    onSuccess: (count) => {
      client.setQueryData(queryKeys.notificationUnread, count);
      void client.invalidateQueries({ queryKey: ['notifications', 'list'] });
    },
  });
}

export function useNotificationPrefsQuery() {
  return useQuery({ queryKey: queryKeys.notificationPrefs, queryFn: notificationsApi.prefs });
}

export function useUpdateNotificationPrefs() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: NotificationPrefsUpdate) => notificationsApi.updatePrefs(patch),
    onSuccess: (prefs) => client.setQueryData(queryKeys.notificationPrefs, prefs),
  });
}
