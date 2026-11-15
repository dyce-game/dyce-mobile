import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

/** A "typing" signal that never gets a "stopped" (app killed, network gone) fades after this long. */
export const TYPING_TTL_MS = 6_000;

type Timers = {
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  ttlMs?: number;
};

/** Who is typing right now, per conversation, with automatic expiry. */
export function createTypingTracker({ setTimer, clearTimer, ttlMs = TYPING_TTL_MS }: Timers = {}) {
  const set = setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clear = clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const store = createStore<{ active: Record<string, true> }>(() => ({ active: {} }));
  const timers = new Map<string, unknown>();

  function setTyping(conversationId: string, typing: boolean) {
    const existing = timers.get(conversationId);
    if (existing !== undefined) clear(existing);
    timers.delete(conversationId);

    const { active } = store.getState();
    if (typing) {
      if (!active[conversationId])
        store.setState({ active: { ...active, [conversationId]: true } });
      timers.set(
        conversationId,
        set(() => setTyping(conversationId, false), ttlMs),
      );
    } else if (active[conversationId]) {
      const next = { ...active };
      delete next[conversationId];
      store.setState({ active: next });
    }
  }

  return {
    store,
    setTyping,
    isTyping: (conversationId: string) => !!store.getState().active[conversationId],
    reset() {
      for (const t of timers.values()) clear(t);
      timers.clear();
      store.setState({ active: {} });
    },
  };
}

export type TypingTracker = ReturnType<typeof createTypingTracker>;

export const typingTracker = createTypingTracker();

export function useIsTyping(conversationId: string): boolean {
  return useStore(typingTracker.store, (s) => !!s.active[conversationId]);
}
