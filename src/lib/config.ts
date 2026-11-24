import { Platform } from 'react-native';
import Constants from 'expo-constants';

type Extra = {
  apiUrl?: string;
  gameServerUrl?: string;
  iosStoreUrl?: unknown;
  androidStoreUrl?: unknown;
  sentryDsn?: unknown;
  posthogKey?: unknown;
  posthogHost?: unknown;
  appEnv?: unknown;
  supportEmail?: unknown;
  privacyUrl?: unknown;
  termsUrl?: unknown;
};
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/**
 * API base URL from app.config.ts (EXPO_PUBLIC_API_URL). The Android emulator reaches the host machine
 * at 10.0.2.2, not localhost, so a localhost URL is rewritten there.
 */
/** The manifest turns an unset value into an empty object, so only a real, non-empty string counts. */
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function resolveApiUrl(raw: string): string {
  if (Platform.OS === 'android')
    return raw.replace('://localhost', '://10.0.2.2').replace('://127.0.0.1', '://10.0.2.2');
  return raw;
}

export type AppEnv = 'development' | 'preview' | 'production';
const appEnv: AppEnv =
  extra.appEnv === 'production' || extra.appEnv === 'preview' ? extra.appEnv : 'development';

export const config = {
  /** Which build this is. Tags error reports and analytics so beta and production never mix. */
  appEnv,
  /** Marketing version from app.config.ts (the store build number is added by EAS). */
  appVersion: Constants.expoConfig?.version ?? '0.0.0',
  /** Error reporting. Null = Sentry is off (no DSN in this build): nothing is loaded or sent. */
  sentryDsn: str(extra.sentryDsn),
  /** Product analytics. Null = PostHog is off: events only reach the dev console. */
  posthogKey: str(extra.posthogKey),
  posthogHost: str(extra.posthogHost) ?? 'https://eu.i.posthog.com',
  /**
   * Where people reach us (Apple 1.2 and 1.5: published contact information). The mailbox itself is a launch task
   * (docs/SETUP_GUIDE.md section 10); the address can be changed per build with EXPO_PUBLIC_SUPPORT_EMAIL.
   */
  supportEmail: str(extra.supportEmail) ?? 'support@dyce.games',
  /** The hosted Privacy Policy and Terms (the same URLs go in App Store Connect). */
  privacyUrl: str(extra.privacyUrl) ?? 'https://dyce.games/privacy',
  termsUrl: str(extra.termsUrl) ?? 'https://dyce.games/terms',
  apiUrl: resolveApiUrl(extra.apiUrl ?? 'http://localhost:3000').replace(/\/$/, ''),
  /** Store pages for "Get it on iPhone / Android". Unset until the store listings exist (BACKLOG). */
  // The manifest turns an unset value into an empty object, so only a real string counts.
  iosStoreUrl:
    typeof extra.iosStoreUrl === 'string' && extra.iosStoreUrl ? extra.iosStoreUrl : null,
  androidStoreUrl:
    typeof extra.androidStoreUrl === 'string' && extra.androidStoreUrl
      ? extra.androidStoreUrl
      : null,
};
