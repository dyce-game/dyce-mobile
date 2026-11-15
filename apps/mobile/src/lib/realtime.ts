import type { RealtimeClient } from '@/features/chat/realtime-client';

/**
 * The one live connection, once the signed-in app has started it (see RealtimeBridge). Screens that only
 * need to *send* a signal (typing) go through here so they don't own the connection.
 */
const handle: { current: RealtimeClient | null } = { current: null };

export const realtimeHandle = handle;

/** Best effort: nothing happens if the connection isn't up. */
export function sendTypingSignal(conversationId: string, typing: boolean): void {
  handle.current?.sendTyping(conversationId, typing);
}
