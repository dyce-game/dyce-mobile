import { Platform } from 'react-native';
import Constants from 'expo-constants';

type Extra = { apiUrl?: string; gameServerUrl?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/**
 * API base URL from app.config.ts (EXPO_PUBLIC_API_URL). The Android emulator reaches the host machine
 * at 10.0.2.2, not localhost, so a localhost URL is rewritten there.
 */
function resolveApiUrl(raw: string): string {
  if (Platform.OS === 'android')
    return raw.replace('://localhost', '://10.0.2.2').replace('://127.0.0.1', '://10.0.2.2');
  return raw;
}

export const config = {
  apiUrl: resolveApiUrl(extra.apiUrl ?? 'http://localhost:3000').replace(/\/$/, ''),
};
