import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { authApi, sessionStore } from '@/lib/api';
import { ApiError } from './api-client';
import type { SessionActions, SessionState } from './session-store';

type Full = SessionState & SessionActions;

/** Subscribe to part of the session: `const status = useSession((s) => s.status)`. */
export function useSession<T>(selector: (s: Full) => T): T {
  return useStore(sessionStore, selector);
}

/**
 * App start: read the stored session, then ask the server where onboarding stands so a restarted app
 * resumes at the right step. Offline is fine (we keep the stored step); a dead session signs out.
 * Returns true when the first screen can be chosen.
 */
export function useBootstrapSession(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await sessionStore.getState().restore();
      if (sessionStore.getState().status === 'signedIn') {
        try {
          const me = await authApi.me();
          sessionStore.getState().setNextStep(me.nextStep);
        } catch (err) {
          // network/server trouble: keep going with what we have. A 401 already signed us out.
          if (!(err instanceof ApiError)) throw err;
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
