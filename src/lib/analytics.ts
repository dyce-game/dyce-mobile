/**
 * Product analytics events (docs/BUILD_PLAN.md). PostHog is wired when a project key exists; until then
 * events go to the dev console only. RULE: never put a phone number, username or any PII in properties.
 */
export type AnalyticsEvent =
  | { name: 'signup_started' }
  | {
      name: 'signup_completed';
      step: 'phone' | 'username' | 'contacts' | 'avatar' | 'bonus' | 'notifications';
    }
  | { name: 'contacts_permission'; result: 'granted' | 'denied' }
  | { name: 'invite_sent'; game: string }
  | { name: 'invite_opened'; surface: 'web' | 'app' }
  | { name: 'guest_round_finished' };

export function track(event: AnalyticsEvent): void {
  if (__DEV__) console.log('[analytics]', JSON.stringify(event));
}
