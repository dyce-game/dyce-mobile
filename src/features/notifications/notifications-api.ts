import type {
  MarkReadRequest,
  NotificationFilter,
  NotificationPrefs,
  NotificationPrefsUpdate,
  NotificationsResponse,
  PushTokenRequest,
  UnreadCount,
} from '@dyce/shared';
import type { ApiClient } from '../auth/api-client';

/** The Notifications list, preferences and push tokens (dyce-backend apps/api/src/notifications). */
export function createNotificationsApi(api: ApiClient) {
  return {
    list: (filter: NotificationFilter, before?: string) =>
      api.get<NotificationsResponse>(
        `/notifications?filter=${filter}&limit=30${before ? `&before=${encodeURIComponent(before)}` : ''}`,
      ),
    unread: () => api.get<UnreadCount>('/notifications/unread-count'),
    markRead: (body: MarkReadRequest) => api.post<UnreadCount>('/notifications/read', body),
    prefs: () => api.get<NotificationPrefs>('/notifications/prefs'),
    updatePrefs: (patch: NotificationPrefsUpdate) =>
      api.patch<NotificationPrefs>('/notifications/prefs', patch),
    registerToken: (body: PushTokenRequest) => api.post<void>('/push/tokens', body),
    removeToken: (token: string) => api.delete<void>('/push/tokens', { body: { token } }),
  };
}

export type NotificationsApi = ReturnType<typeof createNotificationsApi>;
