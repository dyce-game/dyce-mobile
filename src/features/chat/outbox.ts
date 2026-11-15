import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { ThreadMessage } from './chat-logic';

type State = {
  /** Messages being sent, or that failed, per conversation, oldest first. */
  byConversation: Record<string, ThreadMessage[]>;
};

type Actions = {
  add(message: ThreadMessage): void;
  markSending(conversationId: string, id: string): void;
  markFailed(conversationId: string, id: string, error: string, retryable: boolean): void;
  remove(conversationId: string, id: string): void;
};

const EMPTY: ThreadMessage[] = [];

/**
 * Messages that haven't reached the server yet. They live here (not in the server cache) so a failed one
 * stays on screen with a Retry button, and so leaving the thread and coming back doesn't lose it.
 */
export function createOutboxStore() {
  const update = (
    get: () => State,
    set: (s: State) => void,
    conversationId: string,
    fn: (list: ThreadMessage[]) => ThreadMessage[],
  ) => {
    const list = get().byConversation[conversationId] ?? EMPTY;
    const next = fn(list);
    const byConversation = { ...get().byConversation };
    if (next.length === 0) delete byConversation[conversationId];
    else byConversation[conversationId] = next;
    set({ byConversation });
  };

  return createStore<State & Actions>((set, get) => ({
    byConversation: {},
    add: (message) =>
      update(get, set, message.conversationId, (l) => [
        ...l.filter((m) => m.id !== message.id),
        { ...message, status: 'sending' },
      ]),
    markSending: (c, id) =>
      update(get, set, c, (l) =>
        l.map((m) =>
          m.id === id ? { ...m, status: 'sending', error: undefined, retryable: undefined } : m,
        ),
      ),
    markFailed: (c, id, error, retryable) =>
      update(get, set, c, (l) =>
        l.map((m) => (m.id === id ? { ...m, status: 'failed', error, retryable } : m)),
      ),
    remove: (c, id) => update(get, set, c, (l) => l.filter((m) => m.id !== id)),
  }));
}

export type OutboxStore = ReturnType<typeof createOutboxStore>;

export const outboxStore = createOutboxStore();

/** The unsent messages of one conversation (stable reference when there are none). */
export function useOutbox(conversationId: string): ThreadMessage[] {
  return useStore(outboxStore, (s) => s.byConversation[conversationId] ?? EMPTY);
}
