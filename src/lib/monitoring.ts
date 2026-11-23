import type * as SentryNamespace from '@sentry/react-native';
import { Platform } from 'react-native';
import { config } from './config';
import { scrubBreadcrumb, scrubEvent } from './monitoring-scrub';

/**
 * Crash and error reporting (Sentry), behind a build-time flag. Without EXPO_PUBLIC_SENTRY_DSN nothing here
 * loads the SDK or sends anything. Import this module once, first thing, from app/_layout.tsx.
 *
 * Privacy: no default PII, no screenshots or view hierarchy (they can show messages and names), no user is set,
 * and every event and breadcrumb passes through monitoring-scrub.ts. Release health (sessions) is on: it is what
 * the "crash-free sessions" launch gate (>= 99.5% in beta) is measured with.
 */
type SentryModule = typeof SentryNamespace;
let sentry: SentryModule | null = null;

export function initMonitoring(): boolean {
  if (sentry) return true;
  // Web is the guest invite game only: no native layer to report on, and an unreviewed code path on purpose.
  if (!config.sentryDsn || Platform.OS === 'web') return false;
  // Required lazily so a build without a DSN never evaluates the SDK.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sentry = require('@sentry/react-native') as SentryModule;
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.appEnv,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: 0,
    enableAutoSessionTracking: true,
    beforeSend: (event) => scrubEvent(event as never) as never,
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb as never) as never,
  });
  sentry = Sentry;
  return true;
}

/** Report a handled error that still matters (a failed sync, a corrupt payload). No-op when Sentry is off. */
export function reportError(
  error: unknown,
  context?: Record<string, string | number | boolean>,
): void {
  if (!sentry) return;
  sentry.withScope((scope) => {
    if (context) scope.setContext('dyce', context);
    sentry!.captureException(error);
  });
}

initMonitoring();
