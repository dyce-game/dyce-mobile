import type { QueryClient } from '@tanstack/react-query';
import { queryKeys, type MatchView, type RealtimeEvent } from '@dyce/shared';
import { newerMatch } from '../games/games-logic';
import { upsertMessage, withPeerReadAt, type MessagesData } from './chat-logic';
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
      return;

    case 'typing':
      if (event.userId === myId) return;
      typing.setTyping(event.conversationId, event.typing);
      return;
  }
}
