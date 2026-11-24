import { AppState, Platform } from 'react-native';
import { createAnalytics } from './analytics-core';
import { config } from './config';
import { secureStorage } from './storage';

/**
 * Product analytics events (docs/BUILD_PLAN.md "Analytics events (PostHog)").
 *
 * RULES: never put a phone number, username, display name, message text or any other PII in properties (the
 * transport also drops such keys). Amounts are never sent, only bands. Add an event here BEFORE using it, so the
 * list stays the single reviewed catalogue that docs/STORE_PRIVACY_ANSWERS.md describes.
 *
 * Sent to PostHog only when EXPO_PUBLIC_POSTHOG_KEY is set in the build; otherwise the dev console only.
 */
export type StakeBand = 'free' | 'low' | 'mid' | 'high';
export type GameMode = 'free' | 'pool';

export type AnalyticsEvent =
  // Onboarding
  | { name: 'signup_started' }
  | {
      name: 'signup_completed';
      step: 'phone' | 'email' | 'username' | 'contacts' | 'avatar' | 'bonus' | 'notifications';
    }
  | { name: 'contacts_permission'; result: 'granted' | 'denied' }
  | { name: 'avatar_saved' }
  // Chat
  | { name: 'chat_opened' }
  | { name: 'message_sent'; kind: 'text' | 'voice' | 'photo' | 'game' | 'money' | 'poll' }
  | { name: 'request_received' }
  | { name: 'request_accepted' }
  | { name: 'request_declined' }
  // Games
  | { name: 'game_drawer_opened' }
  | { name: 'game_sent'; slug: string; mode: GameMode; stake_band: StakeBand }
  | { name: 'match_accepted'; slug: string; mode: GameMode }
  | { name: 'match_countered'; slug: string }
  | { name: 'match_expired'; slug: string; mode: GameMode }
  | { name: 'match_finished'; slug: string; mode: GameMode; result: 'win' | 'loss' | 'draw' }
  // Spaces
  | { name: 'space_created'; slug: string }
  | { name: 'space_joined'; via: 'code' | 'qr' | 'invite' | 'list' }
  | { name: 'space_started'; slug: string; players: number }
  | { name: 'quick_match_started'; slug: string }
  | { name: 'quick_match_matched'; slug: string }
  // Wallet
  | { name: 'money_sent'; stake_band: StakeBand }
  | { name: 'qr_request_created' }
  | { name: 'qr_scanned'; valid: boolean }
  | { name: 'qr_paid' }
  | { name: 'topup_claimed' }
  // Growth
  | { name: 'invite_sent'; game: string }
  | { name: 'invite_opened'; surface: 'web' | 'app' }
  | { name: 'guest_round_finished' }
  | { name: 'guest_played' }
  | { name: 'invite_converted' }
  // Push and safety
  | { name: 'push_opened'; type: string }
  | { name: 'report_submitted'; reason: string }
  | { name: 'block' };

// Not a security token: a random label that groups one install's events. Math.random is fine here.
const newInstallId = (): string =>
  `i_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;

const INSTALL_ID_KEY = 'dyce.analytics.install_id';

const analytics = createAnalytics({
  key: config.posthogKey,
  host: config.posthogHost,
  fetchImpl: (input, init) => fetch(input, init),
  loadId: () => secureStorage.getItem(INSTALL_ID_KEY),
  saveId: (id) => secureStorage.setItem(INSTALL_ID_KEY, id),
  newId: newInstallId,
  now: () => new Date(),
  base: { platform: Platform.OS, app_version: config.appVersion, app_env: config.appEnv },
  onDev: (name, props) => {
    if (__DEV__) console.log('[analytics]', JSON.stringify({ name, ...props }));
  },
});

// Send what is queued when the app leaves the foreground: it may not come back.
AppState.addEventListener('change', (state) => {
  if (state !== 'active') void analytics.flush();
});

export function track(event: AnalyticsEvent): void {
  const { name, ...props } = event;
  analytics.track(name, props);
}

/** For a Settings "Share usage data" switch (turning it off also drops unsent events). */
export function setAnalyticsEnabled(enabled: boolean): void {
  analytics.setEnabled(enabled);
}
