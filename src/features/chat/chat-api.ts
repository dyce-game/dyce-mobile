import type {
  BotSlug,
  ConversationFilter,
  ConversationSummary,
  ConversationsResponse,
  GroupMembersResponse,
  GroupRole,
  Message,
  MessagesResponse,
  PollPayload,
  ReactionCount,
  ReactionKey,
} from '@dyce/shared';
import type { ApiClient } from '../auth/api-client';

/** Typed wrappers over the conversation endpoints of dyce-backend (apps/api). */
export function createChatApi(api: ApiClient) {
  return {
    list: (filter: ConversationFilter = 'all') =>
      api.get<ConversationsResponse>(`/conversations?filter=${filter}`),
    /** Opens (or creates) your chat with one person. Sends nothing. */
    openDirect: (userId: string) =>
      api.post<ConversationSummary>('/conversations/direct', { userId }),
    /** Your chat with a practice bot (created with its greeting the first time). */
    openBot: (slug: BotSlug) => api.post<ConversationSummary>(`/conversations/bots/${slug}`),
    get: (id: string) => api.get<ConversationSummary>(`/conversations/${id}`),
    messages: (id: string, before?: string) =>
      api.get<MessagesResponse>(
        `/conversations/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
      ),
    /** `input.id` is chosen by the app, so retrying a failed send can't deliver it twice. */
    send: (id: string, input: { id: string; body: string; replyTo?: string }) =>
      api.post<Message>(`/conversations/${id}/messages`, input),
    read: (id: string) => api.post<{ readAt: string }>(`/conversations/${id}/read`),
    accept: (id: string) => api.post<ConversationSummary>(`/conversations/${id}/accept`),
    /** Hides a request; the sender is not told. */
    decline: (id: string) => api.post<void>(`/conversations/${id}/decline`),

    // ---- message actions ----
    /** `reaction: null` takes yours back. Resolves to the message's reactions as you see them. */
    react: (id: string, messageId: string, reaction: ReactionKey | null) =>
      api.put<{ reactions: ReactionCount[] }>(
        `/conversations/${id}/messages/${messageId}/reaction`,
        { reaction },
      ),
    /** `everyone`: your own text or poll, within 15 minutes. */
    deleteMessage: (id: string, messageId: string, scope: 'me' | 'everyone') =>
      api.delete<void>(`/conversations/${id}/messages/${messageId}?scope=${scope}`),

    // ---- groups ----
    /** `id` is chosen by the app, so a retried "Create" can't make two groups. */
    createGroup: (input: { id: string; title: string; memberIds: string[] }) =>
      api.post<ConversationSummary>('/conversations/groups', input),
    members: (id: string) => api.get<GroupMembersResponse>(`/conversations/${id}/members`),
    addMembers: (id: string, userIds: string[]) =>
      api.post<GroupMembersResponse>(`/conversations/${id}/members`, { userIds }),
    removeMember: (id: string, userId: string) =>
      api.delete<GroupMembersResponse>(`/conversations/${id}/members/${userId}`),
    setRole: (id: string, userId: string, role: GroupRole) =>
      api.put<GroupMembersResponse>(`/conversations/${id}/members/${userId}/role`, { role }),
    rename: (id: string, title: string) =>
      api.patch<ConversationSummary>(`/conversations/${id}`, { title }),
    leave: (id: string) => api.post<void>(`/conversations/${id}/leave`),

    // ---- polls ----
    createPoll: (id: string, input: { id: string; question: string; options: string[] }) =>
      api.post<Message>(`/conversations/${id}/polls`, input),
    vote: (id: string, messageId: string, optionId: number | null) =>
      api.put<PollPayload>(`/conversations/${id}/messages/${messageId}/vote`, { optionId }),
  };
}

export type ChatApi = ReturnType<typeof createChatApi>;
