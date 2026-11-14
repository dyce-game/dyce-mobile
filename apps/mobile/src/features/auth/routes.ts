import type { NextStep } from '@dyce/shared';

/**
 * Where the app sends a signed-in user for each onboarding step. Plain strings so this file has no
 * router dependency (callers cast to expo-router's `Href`).
 */
export function hrefForStep(step: NextStep | null): string {
  switch (step) {
    case 'username':
      return '/username';
    case 'contacts':
    case 'avatar':
    case 'bonus':
    case 'notifications':
      return `/onboarding/${step}`;
    case 'done':
    case null:
      // null = signed in but step unknown: let the gate fetch /me, default to the app.
      return '/chat';
  }
}

/** Number of dots in the onboarding progress indicator for the screens in this slice (phone, code+username). */
export const AUTH_STEP_COUNT = 3;
