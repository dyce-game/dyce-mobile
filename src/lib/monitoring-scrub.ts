import { redactString, redactValue } from '@dyce/shared';

/**
 * What leaves the phone in an error report. Pure so it is unit-tested; src/lib/monitoring.ts plugs these into
 * Sentry's `beforeSend` / `beforeBreadcrumb`.
 *
 * Kept: the stack, the app and OS versions, the device model class, the route name, an opaque event id.
 * Dropped or scrubbed: phone numbers and tokens in any string, request headers/cookies/bodies, query strings,
 * user fields other than an opaque id (we never set one), and anything under a sensitive key.
 */
type Loose = Record<string, unknown> & {
  message?: unknown;
  request?: Record<string, unknown>;
  user?: Record<string, unknown>;
  exception?: { values?: { value?: unknown }[] };
  breadcrumbs?: unknown[];
  extra?: unknown;
  contexts?: unknown;
};

export function scrubEvent<T extends Loose>(event: T): T {
  if (event.request) {
    const url = typeof event.request.url === 'string' ? event.request.url.split('?')[0] : undefined;
    event.request = { ...(url ? { url: redactString(url) } : {}) };
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {};
  if (typeof event.message === 'string') event.message = redactString(event.message);
  for (const v of event.exception?.values ?? []) {
    if (typeof v.value === 'string') v.value = redactString(v.value);
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => scrubBreadcrumb(b as Loose));
  }
  if (event.extra) event.extra = redactValue(event.extra);
  if (event.contexts) event.contexts = redactValue(event.contexts);
  return event;
}

export function scrubBreadcrumb<T extends Record<string, unknown>>(crumb: T): T {
  const out: Record<string, unknown> = { ...crumb };
  if (typeof out.message === 'string') out.message = redactString(out.message);
  if (out.data && typeof out.data === 'object') {
    const data = redactValue(out.data) as Record<string, unknown>;
    if (typeof data.url === 'string') data.url = data.url.split('?')[0];
    delete data.query;
    out.data = data;
  }
  return out as T;
}
