import type { AppEnv } from './config';

/**
 * Consent for usage analytics and crash reports (Apple guideline 5.1.1(ii): collecting usage data needs consent
 * even when it is anonymous, and withdrawing it has to be easy).
 *
 * The stored choice is `granted`, `denied` or nothing yet. Nothing yet means:
 *  - a store build (`production`): OFF. Nothing is sent until the person turns it on in Settings.
 *  - a `preview` or `development` build: ON. Those are for testers and the team, who accepted that when they were
 *    given the build, and the beta crash-free-sessions gate (RELEASE_CHECKLIST G1) is measured from them.
 */
export type StoredConsent = 'granted' | 'denied' | null;

export function parseStoredConsent(raw: string | null | undefined): StoredConsent {
  return raw === 'granted' || raw === 'denied' ? raw : null;
}

export function consentAllowed(stored: StoredConsent, env: AppEnv): boolean {
  if (stored === 'granted') return true;
  if (stored === 'denied') return false;
  return env !== 'production';
}
