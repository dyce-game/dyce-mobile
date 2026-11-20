import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSession } from '@/features/auth/use-session';
import { registerDevice } from './push';

/**
 * Native only, mounted once. Shows a push while the app is open, sends a tap on a notification to the place it
 * names (`data.route`), and re-registers this phone's token on every start for a signed-in person who allowed push.
 */
export function PushBridge() {
  const router = useRouter();
  const signedIn = useSession((s) => s.status === 'signedIn');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let sub: { remove: () => void } | undefined;
    let cancelled = false;
    void import('expo-notifications').then((N) => {
      if (cancelled) return;
      N.setNotificationHandler({
        handleNotification: () =>
          Promise.resolve({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: true,
          }),
      });
      sub = N.addNotificationResponseReceivedListener((response) => {
        const route = (
          response.notification.request.content.data as { route?: unknown } | undefined
        )?.route;
        if (typeof route === 'string' && route.startsWith('/')) router.push(route as Href);
      });
    });
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [router]);

  useEffect(() => {
    if (signedIn && Platform.OS !== 'web') void registerDevice();
  }, [signedIn]);

  return null;
}
