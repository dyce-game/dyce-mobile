import { useCallback, useRef } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  queryKeys,
  type BotSlug,
  type ConversationFilter,
  type ConversationSummary,
  type GroupRole,
  type Message,
  type ReactionKey,
  type ReplyPreview,
} from '@dyce/shared';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { chatApi } from '@/lib/api';
import {
  flattenPages,
  newMessageId,
  reactOptimistically,
  removeMessage,
  setPoll,
  setReactions,
  tombstone,
  upsertMessage,
  votedPoll,
  type MessagesData,
  type ThreadMessage,
} from './chat-logic';
import { outboxStore } from './outbox';

/** Your conversations. `unreadTotal` and `requestCount` ride along on every response, for the badges. */
export function useConversationsQuery(filter: ConversationFilter = 'all') {
  return useQuery({
    queryKey: queryKeys.conversations(filter),
    queryFn: () => chatApi.list(filter),
    refetchOnMount: 'always',
  });
}

export function useConversationQuery(id: string) {
  return useQuery({ queryKey: queryKeys.conversation(id), queryFn: () => chatApi.get(id) });
}

/** A thread, newest first, one page at a time. Live events and our own sends are merged into this cache. */
export function useThreadQuery(id: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.messages(id),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => chatApi.messages(id, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnMount: 'always',
  });
}

function refreshLists(client: QueryClient) {
  void client.invalidateQueries({ queryKey: queryKeys.conversationsAll });
}

/** Move the conversation's fresh summary into the detail cache and refresh the lists. */
function useConversationMutation(fn: (id: string) => Promise<ConversationSummary | void>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (summary, id) => {
      if (summary) client.setQueryData(queryKeys.conversation(id), summary);
      else void client.invalidateQueries({ queryKey: queryKeys.conversation(id) });
      refreshLists(client);
    },
  });
}

export const useAcceptConversation = () => useConversationMutation((id) => chatApi.accept(id));
export const useDeclineConversation = () => useConversationMutation((id) => chatApi.decline(id));

/** Open (or create) the chat with one person; resolves to the conversation. */
export function useOpenDirect() {
  return useMutation({ mutationFn: (userId: string) => chatApi.openDirect(userId) });
}

/** Tells the server you've read the thread (clears the unread count; the other person sees "Read"). */
export function useMarkRead(conversationId: string) {
  const client = useQueryClient();
  return useCallback(() => {
    chatApi
      .read(conversationId)
      .then(() => refreshLists(client))
      .catch(() => undefined); // not worth interrupting anyone for; the next open tries again
  }, [client, conversationId]);
}

/** Network trouble and server errors are worth retrying; "they must reply first" is not. */
export function isRetryable(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === 'network' || err.status >= 500 || err.code === 'rate_limited')
  );
}

/**
 * Sending with an optimistic bubble. The message is shown at once from the outbox; on success the
 * server's copy replaces it, on failure it stays with a reason and a Retry. The id never changes, so a
 * retry (even after a lost response) can't deliver it twice.
 */
export function useSendMessage(conversationId: string) {
  const client = useQueryClient();
  const myId = useSession((s) => s.userId);
  // never two sends of the same message at once
  const inFlight = useRef(new Set<string>());

  const deliver = useCallback(
    async (message: ThreadMessage) => {
      if (inFlight.current.has(message.id)) return;
      inFlight.current.add(message.id);
      outboxStore.getState().markSending(conversationId, message.id);
      try {
        const saved = await chatApi.send(conversationId, {
          id: message.id,
          body: message.body,
          replyTo: message.replyTo?.id,
        });
        const cached = client.getQueryData<MessagesData>(queryKeys.messages(conversationId));
        if (cached) {
          client.setQueryData<MessagesData>(queryKeys.messages(conversationId), (d) =>
            upsertMessage(d, saved),
          );
        } else {
          void client.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
        }
        outboxStore.getState().remove(conversationId, message.id);
        refreshLists(client);
      } catch (err) {
        outboxStore
          .getState()
          .markFailed(conversationId, message.id, authErrorMessage(err), isRetryable(err));
      } finally {
        inFlight.current.delete(message.id);
      }
    },
    [client, conversationId],
  );

  const send = useCallback(
    (body: string, replyTo?: ReplyPreview | null) => {
      const text = body.trim();
      if (!text || !myId) return;
      const message: ThreadMessage = {
        id: newMessageId(),
        conversationId,
        senderId: myId,
        kind: 'text',
        body: text,
        createdAt: new Date().toISOString(),
        status: 'sending',
        replyTo: replyTo ?? null,
      };
      outboxStore.getState().add(message);
      void deliver(message);
    },
    [conversationId, deliver, myId],
  );

  const retry = useCallback(
    (message: ThreadMessage) => {
      void deliver(message);
    },
    [deliver],
  );

  const discard = useCallback(
    (id: string) => outboxStore.getState().remove(conversationId, id),
    [conversationId],
  );

  return { send, retry, discard };
}

// ---- bots ----------------------------------------------------------------------------------------

/** Open (or create) your chat with a practice bot; resolves to the conversation. */
export function useOpenBot() {
  return useMutation({ mutationFn: (slug: BotSlug) => chatApi.openBot(slug) });
}

// ---- reactions and deletes (optimistic) ----------------------------------------------------------

/**
 * React to a message: the chip shows at once; the server's tally replaces it, and a failure puts the old
 * one back. Tapping the reaction you already gave takes it back. Resolves to an error message, or null.
 */
export function useReact(conversationId: string) {
  const client = useQueryClient();
  return useCallback(
    async (messageId: string, key: ReactionKey): Promise<string | null> => {
      const k = queryKeys.messages(conversationId);
      const before = client.getQueryData<MessagesData>(k);
      const { data, reaction } = reactOptimistically(before, messageId, key);
      if (data === before) return null;
      client.setQueryData<MessagesData>(k, data);
      try {
        const r = await chatApi.react(conversationId, messageId, reaction);
        client.setQueryData<MessagesData>(k, (d) => setReactions(d, messageId, r.reactions));
        return null;
      } catch (err) {
        const old = flattenPages(before).find((m) => m.id === messageId)?.reactions ?? [];
        client.setQueryData<MessagesData>(k, (d) => setReactions(d, messageId, old));
        return authErrorMessage(err);
      }
    },
    [client, conversationId],
  );
}

/** Delete for me (gone at once) or for everyone (a tombstone at once); a failure reloads the thread. */
export function useDeleteMessage(conversationId: string) {
  const client = useQueryClient();
  return useCallback(
    async (messageId: string, scope: 'me' | 'everyone'): Promise<string | null> => {
      const k = queryKeys.messages(conversationId);
      client.setQueryData<MessagesData>(k, (d) =>
        scope === 'me' ? removeMessage(d, messageId) : tombstone(d, messageId),
      );
      try {
        await chatApi.deleteMessage(conversationId, messageId, scope);
        refreshLists(client);
        return null;
      } catch (err) {
        void client.invalidateQueries({ queryKey: k });
        return authErrorMessage(err);
      }
    },
    [client, conversationId],
  );
}

// ---- polls ---------------------------------------------------------------------------------------

/** Vote in a poll (null takes your vote back). Shown at once, confirmed by the server's tally. */
export function useVote(conversationId: string) {
  const client = useQueryClient();
  return useCallback(
    async (message: Message, optionId: number | null): Promise<string | null> => {
      if (message.kind !== 'poll') return null;
      const k = queryKeys.messages(conversationId);
      const before = message.payload;
      client.setQueryData<MessagesData>(k, (d) =>
        setPoll(d, message.id, votedPoll(before, optionId)),
      );
      try {
        const payload = await chatApi.vote(conversationId, message.id, optionId);
        client.setQueryData<MessagesData>(k, (d) => setPoll(d, message.id, payload));
        return null;
      } catch (err) {
        client.setQueryData<MessagesData>(k, (d) => setPoll(d, message.id, before));
        return authErrorMessage(err);
      }
    },
    [client, conversationId],
  );
}

export function useCreatePoll(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; question: string; options: string[] }) =>
      chatApi.createPoll(conversationId, input),
    onSuccess: (saved) => {
      client.setQueryData<MessagesData>(queryKeys.messages(conversationId), (d) =>
        upsertMessage(d, saved),
      );
      refreshLists(client);
    },
  });
}

// ---- groups --------------------------------------------------------------------------------------

/** Everyone who is or was in a group (names and avatars for the thread, and the member list). */
export function useGroupMembersQuery(conversationId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.groupMembers(conversationId),
    queryFn: () => chatApi.members(conversationId),
    enabled,
  });
}

/** `id` is picked once per form, so a retried Create can't make two groups. */
export function useCreateGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; title: string; memberIds: string[] }) =>
      chatApi.createGroup(input),
    onSuccess: (summary) => {
      client.setQueryData(queryKeys.conversation(summary.id), summary);
      refreshLists(client);
    },
  });
}

function useGroupMutation<V>(conversationId: string, fn: (v: V) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
      void client.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
      refreshLists(client);
    },
  });
}

export const useAddMembers = (id: string) =>
  useGroupMutation(id, (userIds: string[]) => chatApi.addMembers(id, userIds));
export const useRemoveMember = (id: string) =>
  useGroupMutation(id, (userId: string) => chatApi.removeMember(id, userId));
export const useSetMemberRole = (id: string) =>
  useGroupMutation(id, (v: { userId: string; role: GroupRole }) =>
    chatApi.setRole(id, v.userId, v.role),
  );
export const useRenameGroup = (id: string) =>
  useGroupMutation(id, (title: string) => chatApi.rename(id, title));

export function useLeaveGroup(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => chatApi.leave(conversationId),
    onSuccess: () => {
      client.removeQueries({ queryKey: queryKeys.messages(conversationId) });
      client.removeQueries({ queryKey: queryKeys.conversation(conversationId) });
      refreshLists(client);
    },
  });
}
