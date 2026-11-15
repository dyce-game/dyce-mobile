import { useCallback, useRef } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { queryKeys, type ConversationFilter, type ConversationSummary } from '@dyce/shared';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { chatApi } from '@/lib/api';
import { newMessageId, upsertMessage, type MessagesData, type ThreadMessage } from './chat-logic';
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
        const saved = await chatApi.send(conversationId, { id: message.id, body: message.body });
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
    (body: string) => {
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
