import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth/use-session';
import { config } from '@/lib/config';
import { getFreshAccessToken } from '@/lib/api';
import { realtimeHandle } from '@/lib/realtime';
import { createRealtimeClient, realtimeUrl } from './realtime-client';
import { applyRealtimeEvent } from './realtime-cache';
import { outboxStore } from './outbox';
import { typingTracker } from './typing';

/**
 * Keeps the live connection open while someone is signed in (and finished onboarding), and feeds what it
 * hears into the query cache. Renders nothing.
 */
export function RealtimeBridge() {
  const client = useQueryClient();
  const status = useSession((s) => s.status);
  const userId = useSession((s) => s.userId);
  const nextStep = useSession((s) => s.nextStep);
  const ready = status === 'signedIn' && !!userId && (!nextStep || nextStep === 'done');

  useEffect(() => {
    if (!ready) return;
    const live = createRealtimeClient({
      url: realtimeUrl(config.apiUrl),
      getToken: getFreshAccessToken,
      onEvent: (event) => applyRealtimeEvent(client, event, userId, typingTracker),
    });
    realtimeHandle.current = live;
    live.start();
    // Coming back to the app: don't wait out a backoff timer.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') live.reconnectNow();
    });
    return () => {
      sub.remove();
      live.stop();
      realtimeHandle.current = null;
      typingTracker.reset();
    };
  }, [ready, userId, client]);

  // Signing out (or switching account) must not leave the previous person's unsent messages around.
  useEffect(() => {
    if (status === 'signedOut') {
      outboxStore.setState({ byConversation: {} });
      client.removeQueries({ queryKey: ['conversations'] });
      client.removeQueries({ queryKey: ['messages'] });
      client.removeQueries({ queryKey: ['conversation'] });
    }
  }, [status, client]);

  return null;
}
