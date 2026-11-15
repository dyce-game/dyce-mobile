import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Env-driven values use EXPO_PUBLIC_* so they are inlined at build time. No secrets belong here:
 * the app only ever holds a short-lived access token issued by dyce-backend (apps/api).
 * Bundle id `games.dyce.app` is a SUGGESTION until the store accounts exist ([HUMAN] decision 1).
 */
const BUNDLE_ID = 'games.dyce.app';
const DOMAIN = 'dyce.games';
const LINK_PATHS = ['/i', '/r', '/u', '/s']; // invite, QR request, user, space

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Dyce',
  slug: 'dyce',
  scheme: 'dyce',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic', // theme follows the device; there is no in-app toggle
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    associatedDomains: [`applinks:${DOMAIN}`],
    infoPlist: {
      NSContactsUsageDescription:
        'Dyce finds friends who are already on Dyce. Phone numbers are checked on our server and never stored.',
      NSCameraUsageDescription:
        'Dyce uses the camera to scan Dyce QR codes and to take photos in chats.',
      NSMicrophoneUsageDescription: 'Dyce uses the microphone for voice notes.',
      NSPhotoLibraryUsageDescription: 'Dyce lets you pick photos to send and QR codes to scan.',
      NSMotionUsageDescription: 'Dyce uses motion to flip your phone for Charades.',
      NSFaceIDUsageDescription: 'Dyce uses Face ID to confirm payments.',
    },
  },
  android: {
    package: BUNDLE_ID,
    permissions: [
      'READ_CONTACTS',
      'CAMERA',
      'RECORD_AUDIO',
      'VIBRATE',
      'POST_NOTIFICATIONS',
      'USE_BIOMETRIC',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: LINK_PATHS.map((pathPrefix) => ({ scheme: 'https', host: DOMAIN, pathPrefix })),
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: { bundler: 'metro', output: 'single', favicon: undefined },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-splash-screen',
    'expo-status-bar',
    [
      'expo-contacts',
      {
        contactsPermission:
          'Dyce finds friends who are already on Dyce. Phone numbers are checked on our server and never stored.',
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    gameServerUrl: process.env.EXPO_PUBLIC_GAME_SERVER_URL ?? 'ws://localhost:2567',
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? null,
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? null,
  },
});
