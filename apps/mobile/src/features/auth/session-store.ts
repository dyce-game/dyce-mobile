import { createStore } from 'zustand/vanilla';
import type { NextStep, SessionResponse } from '@dyce/shared';
import type { Tokens } from './api-client';

/** Minimal async key-value storage. Native uses the Keychain/Keystore; web uses localStorage. */
export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type SessionState = {
  /** "loading" until the stored session has been read (and, if present, checked with the server). */
  status: 'loading' | 'signedOut' | 'signedIn';
  tokens: Tokens | null;
  userId: string | null;
  nextStep: NextStep | null;
  /**
   * ISO country of the number the user signed in with ("NG"). Used to read national-format numbers in their
   * address book. It is only the country, never the number.
   */
  country: string | null;
};

export type SessionActions = {
  /** Read the stored session. Always leaves "loading". */
  restore(): Promise<void>;
  signIn(session: SessionResponse, country?: string | null): Promise<void>;
  setTokens(tokens: Tokens | null): Promise<void>;
  setNextStep(step: NextStep): void;
  signOut(): Promise<void>;
};

const KEY = 'dyce.session.v1';

type Persisted = {
  tokens: Tokens;
  userId: string;
  nextStep: NextStep | null;
  country?: string | null;
};

/**
 * Session state (Zustand) persisted to secure storage. Only tokens, the user id, the last-known
 * onboarding step and the phone's country are stored: no phone number, no profile data.
 */
export function createSessionStore(storage: KeyValueStorage) {
  const persist = async (s: SessionState) => {
    if (s.tokens && s.userId) {
      const data: Persisted = {
        tokens: s.tokens,
        userId: s.userId,
        nextStep: s.nextStep,
        country: s.country,
      };
      await storage.setItem(KEY, JSON.stringify(data));
    } else {
      await storage.removeItem(KEY);
    }
  };

  return createStore<SessionState & SessionActions>((set, get) => ({
    status: 'loading',
    tokens: null,
    userId: null,
    nextStep: null,
    country: null,

    async restore() {
      try {
        const raw = await storage.getItem(KEY);
        const data = raw ? (JSON.parse(raw) as Persisted) : null;
        if (data?.tokens?.accessToken && data.tokens.refreshToken && data.userId) {
          set({
            status: 'signedIn',
            tokens: data.tokens,
            userId: data.userId,
            nextStep: data.nextStep ?? null,
            country: data.country ?? null,
          });
          return;
        }
      } catch {
        // corrupt or unreadable storage: fall through to signed out
      }
      set({ status: 'signedOut', tokens: null, userId: null, nextStep: null, country: null });
    },

    async signIn(session, country = null) {
      set({
        status: 'signedIn',
        tokens: { accessToken: session.accessToken, refreshToken: session.refreshToken },
        userId: session.userId,
        nextStep: session.nextStep,
        country,
      });
      await persist(get());
    },

    async setTokens(tokens) {
      if (!tokens) {
        await get().signOut();
        return;
      }
      set({ tokens });
      await persist(get());
    },

    setNextStep(step) {
      set({ nextStep: step });
      void persist(get());
    },

    async signOut() {
      set({ status: 'signedOut', tokens: null, userId: null, nextStep: null, country: null });
      await persist(get());
    },
  }));
}

export type SessionStore = ReturnType<typeof createSessionStore>;
