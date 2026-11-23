import type { QueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  type MatchView,
  type QuickMatchState,
  type RealtimeEvent,
  type SpaceView,
} from '@dyce/shared';
import { newerMatch } from '../games/games-logic';
import { newerSpace } from '../spaces/spaces-logic';
import {
  applyPollEvent,
  applyReactionEvent,
  removeMessage,
  tombstone,
  upsertMessage,
  withPeerReadAt,
  type MessagesData,
} from './chat-logic';
import type { TypingTracker } from './typing';

/**
 * Applies a live event to what the app already has on screen. Threads update instantly from the event;
 * lists (which also carry unread counts and ordering) are simply refetched.
 */
export function applyRealtimeEvent(
  client: QueryClient,
  event: RealtimeEvent,
  myId: string | null,
  typing: TypingTracker,
): void {
  switch (event.type) {
    case 'ready':
      // (Re)connected: anything that happened while we were away is on the server, not in our cache.
      void client.invalidateQueries({ queryKey: queryKeys.conversationsAll });
      void client.invalidateQueries({ queryKey: ['messages'] });
      void client.invalidateQueries({ queryKey: ['match'] });
      void client.invalidateQueries({ queryKey: ['space'] });
      void client.invalidateQueries({ queryKey: ['spaces'] });
      return;

    case 'message': {
      const m = event.message;
      client.setQueryData<MessagesData>(queryKeys.messages(m.conversationId), (d) =>
        upsertMessage(d, m),
      );
      if (m.senderId !== myId) typing.setTyping(m.conversationId, false); // they sent it, so they're done typing
      void client.invalidateQueries({ queryKey: queryKeys.conversationsAll });
      return;
    }

    case 'reaction':
      client.setQueryData<MessagesData>(queryKeys.messages(event.conversationId), (d) =>
        applyReactionEvent(d, event, myId),
      );
      return;

    case 'poll':
      client.setQueryData<MessagesData>(queryKeys.messages(event.conversationId), (d) =>
        applyPollEvent(d, event, myId),
      );
      return;

    case 'message_deleted':
      client.setQueryData<MessagesData>(queryKeys.messages(event.conversationId), (d) =>
        event.scope === 'me' ? removeMessage(d, event.messageId) : tombstone(d, event.messageId),
      );
      void client.invalidateQueries({ queryKey: queryKeys.conversationsAll }); // the preview line may change
      return;

    case 'conversation':
      // A group changed (name, members, roles), or you are no longer in it.
      void client.invalidateQueries({ queryKey: queryKeys.conversation(event.conversationId) });
      void client.invalidateQueries({ queryKey: queryKeys.conversationsAll });
      if (event.change === 'removed') {
        client.removeQueries({ queryKey: queryKeys.messages(event.conversationId) });
      }
      return;

    case 'read':
      if (event.userId === myId) return;
      client.setQueryData<MessagesData>(queryKeys.messages(event.conversationId), (d) =>
        withPeerReadAt(d, event.at),
      );
      return;

    case 'match':
      // Each player is sent their own view of the match: it replaces the cached one unless it is older.
      client.setQueryData<MatchView>(queryKeys.match(event.match.id), (cached) =>
        newerMatch(cached, event.match),
      );
      // A Pool match moved money (stake locked, refund, payout): the balance follows.
      if (event.match.mode === 'pool' || event.match.players.some((p) => p.stakedKobo > 0)) {
        void client.invalidateQueries({ queryKey: queryKeys.wallet });
        void client.invalidateQueries({ queryKey: queryKeys.poolInfo });
      }
      return;

    case 'space':
      // A space you sit in changed (someone sat down or left, it started, it ended): your own view of it.
      client.setQueryData<SpaceView>(queryKeys.space(event.space.id), (cached) =>
        newerSpace(cached, event.space),
      );
      void client.invalidateQueries({ queryKey: queryKeys.spaces('mine') });
      if (event.space.mode === 'pool')
        void client.invalidateQueries({ queryKey: queryKeys.wallet });
      return;

    case 'quick_match':
      // Your quick-match ticket changed (a match was found, the other person skipped, it started).
      client.setQueryData<QuickMatchState>(queryKeys.quickMatch, (cached) => ({
        games: cached?.games ?? [],
        ticket: event.ticket,
      }));
      if (event.ticket.mode === 'pool')
        void client.invalidateQueries({ queryKey: queryKeys.wallet });
      return;

    case 'notification':
      // Something new for the Notifications list: the count on the bell and the list itself refetch.
      client.setQueryData(queryKeys.notificationUnread, { unread: event.unread });
      void client.invalidateQueries({ queryKey: ['notifications', 'list'] });
      return;

    case 'typing':
      if (event.userId === myId) return;
      typing.setTyping(event.conversationId, event.typing);
      return;
  }
}
