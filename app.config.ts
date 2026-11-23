import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * One config, three build variants (APP_ENV is set per profile in eas.json): development, preview, production.
 * The variants have different application ids so a tester can keep the production app and a beta side by side.
 *
 * Env-driven values use EXPO_PUBLIC_* so they are inlined at build time. NO SECRETS belong here or in eas.json:
 * the app only ever holds a short-lived access token issued by dyce-backend. Everything configurable is listed in
 * `.env.example` and docs/RELEASE_CHECKLIST.md, and set per build profile with `eas env:create`.
 *
 * Bundle id `games.dyce.app` is a SUGGESTION until the store accounts exist ([HUMAN] decision 1).
 */
type AppEnv = 'development' | 'preview' | 'production';
const APP_ENV: AppEnv =
  process.env.APP_ENV === 'production' || process.env.APP_ENV === 'preview'
    ? process.env.APP_ENV
    : 'development';
const IS_PROD = APP_ENV === 'production';

const BASE_ID = 'games.dyce.app';
const VARIANT = {
  production: { id: BASE_ID, name: 'Dyce', scheme: 'dyce' },
  preview: { id: `${BASE_ID}.preview`, name: 'Dyce Preview', scheme: 'dyce-preview' },
  development: { id: `${BASE_ID}.dev`, name: 'Dyce Dev', scheme: 'dyce-dev' },
}[APP_ENV];

const DOMAIN = 'dyce.games';
/**
 * Universal links (iOS) and app links (Android) for https://dyce.games. The app side is configured here; the
 * domain side needs the two files in public/.well-known (apple-app-site-association, assetlinks.json) served
 * from dyce.games with the Apple team id and the Play signing fingerprint filled in. Both need store accounts
 * (docs/BACKLOG.md). Only the PRODUCTION app claims the domain; beta builds open invites through the dyce-preview://
 * scheme. Until then invite links open the guest web game, and dyce://i/<token> opens the app.
 */
const LINK_PATHS = ['/i', '/r', '/u', '/s']; // invite, QR request, user, space

/**
 * Marketing version, shown in the stores. Bump it by hand for every store release (docs/RELEASE_CHECKLIST.md,
 * "Versioning"). The build number is NOT here: EAS assigns it (appVersionSource "remote" + autoIncrement).
 */
const VERSION = '0.1.0';

/**
 * The EAS project (linked with `eas init --id`, 2026-11-23). It is an identifier, not a secret; `EAS_PROJECT_ID`
 * overrides it for a fork or a staging project. Enables over-the-air updates.
 */
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? 'c29cc31f-6903-478e-9160-8d639e307eab';
/** Sentry source maps and native debug files upload at build time; needs SENTRY_AUTH_TOKEN as an EAS secret. */
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: VARIANT.name,
  slug: 'dyce',
  // The Expo account that owns the EAS project (`eas init` asked for this; the project belongs to `kymsoft`, so
  // EAS commands must run logged in as that account or as a member of it).
  owner: 'kymsoft',
  scheme: VARIANT.scheme,
  version: VERSION,
  orientation: 'portrait',
  userInterfaceStyle: 'automatic', // theme follows the device; there is no in-app toggle
  // OTA updates (EAS Update). The runtime version is a fingerprint of everything native, so an update is only ever
  // delivered to builds whose native code it was made for: a JS-only change ships over the air, a change to a
  // native dependency needs a new store build and the fingerprint changes by itself.
  runtimeVersion: { policy: 'fingerprint' },
  ...(EAS_PROJECT_ID
    ? {
        updates: {
          url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
          // Development builds load from Metro; never replace them with a published bundle.
          enabled: APP_ENV !== 'development',
          checkAutomatically: 'ON_LOAD' as const,
          fallbackToCacheTimeout: 0,
        },
      }
    : {}),
  ios: {
    bundleIdentifier: VARIANT.id,
    supportsTablet: false,
    ...(IS_PROD ? { associatedDomains: [`applinks:${DOMAIN}`] } : {}),
    // Standard encryption only (TLS): lets the App Store skip the export-compliance question on every upload.
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSContactsUsageDescription:
        'Dyce finds friends who are already on Dyce. Phone numbers are checked on our server and never stored.',
      NSMotionUsageDescription: 'Dyce uses motion to flip your phone for Charades.',
      // Declare these WITH the feature that needs them (QR scanning, voice notes, photos, Face ID payments),
      // and update docs/STORE_PRIVACY_ANSWERS.md in the same change. Not used by the current build.
      //   NSCameraUsageDescription: 'Dyce uses the camera to scan Dyce QR codes and to take photos in chats.',
      //   NSMicrophoneUsageDescription: 'Dyce uses the microphone for voice notes.',
      //   NSPhotoLibraryUsageDescription: 'Dyce lets you pick photos to send and QR codes to scan.',
      //   NSFaceIDUsageDescription: 'Dyce uses Face ID to confirm payments.',
    },
  },
  android: {
    package: VARIANT.id,
    // POST_NOTIFICATIONS is added by the expo-notifications plugin. CAMERA, RECORD_AUDIO and USE_BIOMETRIC are
    // added with the features that use them (see the iOS note above).
    permissions: ['READ_CONTACTS', 'VIBRATE'],
    ...(IS_PROD
      ? {
          intentFilters: [
            {
              action: 'VIEW',
              autoVerify: true,
              data: LINK_PATHS.map((pathPrefix) => ({ scheme: 'https', host: DOMAIN, pathPrefix })),
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ],
        }
      : {}),
  },
  web: { bundler: 'metro', output: 'single', favicon: undefined },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-splash-screen',
    'expo-status-bar',
    'expo-notifications',
    [
      'expo-contacts',
      {
        contactsPermission:
          'Dyce finds friends who are already on Dyce. Phone numbers are checked on our server and never stored.',
      },
    ],
    // Uploads source maps + native debug symbols so crash reports are readable. Only when the project is named.
    ...(SENTRY_ORG && SENTRY_PROJECT
      ? [
          ['@sentry/react-native/expo', { organization: SENTRY_ORG, project: SENTRY_PROJECT }] as [
            string,
            object,
          ],
        ]
      : []),
  ],
  experiments: { typedRoutes: true },
  extra: {
    appEnv: APP_ENV,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    gameServerUrl: process.env.EXPO_PUBLIC_GAME_SERVER_URL ?? 'ws://localhost:2567',
    // Store pages for the invite landing page's "Get it on iPhone / Android"; unset until the listings exist.
    iosStoreUrl: process.env.EXPO_PUBLIC_IOS_STORE_URL ?? null,
    androidStoreUrl: process.env.EXPO_PUBLIC_ANDROID_STORE_URL ?? null,
    // Observability: both are no-ops when unset (nothing is loaded, nothing is sent).
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? null,
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? null,
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? null,
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
