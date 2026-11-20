import { create } from 'zustand';
import { secureStorage } from '@/lib/storage';
import { phoneFromFragment } from './invite-link';

/**
 * The invite someone arrived with, remembered on the device until they have signed up (ADR-021). On a phone
 * with the app installed the link opens the app and is remembered here; in a browser it is remembered when
 * the guest taps through to sign-up. The number comes from the link's fragment and stays on this device.
 */
export type PendingInvite = { token: string; phone: string | null };

const KEY = 'dyce.pendingInvite';

export function parsePendingInvite(raw: string | null): PendingInvite | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { token?: unknown; phone?: unknown };
    if (typeof v.token !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(v.token)) return null;
    return {
      token: v.token,
      phone:
        typeof v.phone === 'string' ? phoneFromFragment(`p=${v.phone.replace(/\D/g, '')}`) : null,
    };
  } catch {
    return null;
  }
}

export async function getPendingInvite(): Promise<PendingInvite | null> {
  try {
    return parsePendingInvite(await secureStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/** Keeps the number from an earlier visit when this one has none (the fragment is gone after navigating). */
export async function rememberInvite(invite: PendingInvite): Promise<void> {
  try {
    const before = await getPendingInvite();
    const phone = invite.phone ?? (before?.token === invite.token ? before.phone : null);
    await secureStorage.setItem(KEY, JSON.stringify({ token: invite.token, phone }));
  } catch {
    // Remembering is a convenience: the link still works without it.
  }
}

export async function clearPendingInvite(): Promise<void> {
  try {
    await secureStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}

/** The secret of this browser's guest run, so a refresh resumes the same round. */
const guestKey = (token: string) => `dyce.guest.${token}`;
export const guestTokenStore = {
  get: async (token: string): Promise<string | null> => {
    try {
      return await secureStorage.getItem(guestKey(token));
    } catch {
      return null;
    }
  },
  set: async (token: string, value: string): Promise<void> => {
    try {
      await secureStorage.setItem(guestKey(token), value);
    } catch {
      // without it a refresh cannot resume: acceptable
    }
  },
  clear: async (token: string): Promise<void> => {
    try {
      await secureStorage.removeItem(guestKey(token));
    } catch {
      // nothing to do
    }
  },
};

/** Where to go once onboarding is done: straight into the game the invite was for. */
type LandingState = {
  matchId: string | null;
  setMatch: (matchId: string | null) => void;
};
export const useInviteLanding = create<LandingState>((set) => ({
  matchId: null,
  setMatch: (matchId) => set({ matchId }),
}));
