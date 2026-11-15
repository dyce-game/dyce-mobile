import type {
  ConversationFilter,
  ConversationSummary,
  ConversationsResponse,
  Message,
  MessagesResponse,
} from '@dyce/shared';
import type { ApiClient } from '../auth/api-client';

/** Typed wrappers over the conversation endpoints of apps/api. */
export function createChatApi(api: ApiClient) {
  return {
    list: (filter: ConversationFilter = 'all') =>
      api.get<ConversationsResponse>(`/conversations?filter=${filter}`),
    /** Opens (or creates) your chat with one person. Sends nothing. */
    openDirect: (userId: string) =>
      api.post<ConversationSummary>('/conversations/direct', { userId }),
    get: (id: string) => api.get<ConversationSummary>(`/conversations/${id}`),
    messages: (id: string, before?: string) =>
      api.get<MessagesResponse>(
        `/conversations/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
      ),
    /** `input.id` is chosen by the app, so retrying a failed send can't deliver it twice. */
    send: (id: string, input: { id: string; body: string }) =>
      api.post<Message>(`/conversations/${id}/messages`, input),
    read: (id: string) => api.post<{ readAt: string }>(`/conversations/${id}/read`),
    accept: (id: string) => api.post<ConversationSummary>(`/conversations/${id}/accept`),
    /** Hides a request; the sender is not told. */
    decline: (id: string) => api.post<void>(`/conversations/${id}/decline`),
  };
}

export type ChatApi = ReturnType<typeof createChatApi>;
