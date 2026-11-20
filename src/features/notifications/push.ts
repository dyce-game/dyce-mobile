import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { PushTokenRequest } from '@dyce/shared';
import { notificationsApi } from '@/lib/api';
import { secureStorage } from '@/lib/storage';

/** What the phone says about notification permission. Web has no push in Dyce (the web build is the guest game). */
export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const TOKEN_KEY = 'dyce.push-token';

const supported = () => Platform.OS === 'ios' || Platform.OS === 'android';

async function mod() {
  return import('expo-notifications');
}

export async function getPushPermission(): Promise<PushPermission> {
  if (!supported()) return 'unsupported';
  const N = await mod();
  const p = await N.getPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

/** Shows the system prompt (once; the phone remembers a refusal). */
export async function askPushPermission(): Promise<PushPermission> {
  if (!supported()) return 'unsupported';
  const N = await mod();
  const p = await N.requestPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

/**
 * Gets this phone's Expo push token and tells the server, so it can reach this device. Safe to call on every
 * start: the server moves a token to whoever is signed in. Returns the token, or null (no permission, a simulator,
 * or no EAS project id yet). Never throws: a failure here must not block the app.
 */
export async function registerDevice(): Promise<string | null> {
  try {
    if ((await getPushPermission()) !== 'granted') return null;
    const N = await mod();
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', {
        name: 'Dyce',
        importance: N.AndroidImportance.HIGH,
      });
    }
    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    const projectId = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await notificationsApi.registerToken({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    } satisfies PushTokenRequest);
    await secureStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    return null;
  }
}

/** Signing out: stop pushing to this phone. Best effort (offline is fine; the server drops dead tokens). */
export async function unregisterDevice(): Promise<void> {
  try {
    const token = await secureStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await notificationsApi.removeToken(token).catch(() => undefined);
    await secureStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing to undo
  }
}
