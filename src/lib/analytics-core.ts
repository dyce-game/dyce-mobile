/**
 * PostHog capture without the PostHog SDK: events are batched and POSTed to `/batch/`. No native module, no extra
 * dependency, nothing runs unless a project key is configured. Pure and injectable so it is unit-tested.
 *
 * Privacy (CLAUDE.md, SPEC section 14): events are ANONYMOUS. The only identifier is a random per-install id that is
 * never linked to a user, phone number or username, `$process_person_profile` is false so PostHog builds no person
 * profile, and properties are limited to short non-identifying primitives (a runtime guard drops anything else).
 * In the PostHog project settings, turn on "Discard client IP data".
 */
export type AnalyticsProps = Record<string, string | number | boolean>;

export type AnalyticsDeps = {
  /** Null = analytics is off: track() does nothing but call `onDev`. */
  key: string | null;
  host: string;
  fetchImpl: typeof fetch;
  /** Reads/writes the random install id (secure storage). */
  loadId: () => Promise<string | null>;
  saveId: (id: string) => Promise<void>;
  newId: () => string;
  now: () => Date;
  /** Properties added to every event: platform, app version, environment. */
  base: AnalyticsProps;
  /** Schedules the delayed flush; injected so tests do not wait. */
  schedule?: (fn: () => void, ms: number) => unknown;
  flushAt?: number;
  flushAfterMs?: number;
  maxQueue?: number;
  /** Development console echo. */
  onDev?: (name: string, props: AnalyticsProps) => void;
};

type Queued = { event: string; properties: AnalyticsProps; timestamp: string };

/** Property names that must never be sent, whatever a caller passes. */
const FORBIDDEN_KEY =
  /(phone|number|token|user(name)?|name|email|address|contact|message|text|code|otp|password)/i;
const MAX_STRING = 64;

export function sanitizeProps(props: Record<string, unknown> | undefined): AnalyticsProps {
  const out: AnalyticsProps = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (FORBIDDEN_KEY.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= MAX_STRING) out[k] = v;
  }
  return out;
}

export function createAnalytics(deps: AnalyticsDeps) {
  const flushAt = deps.flushAt ?? 10;
  const flushAfterMs = deps.flushAfterMs ?? 15_000;
  const maxQueue = deps.maxQueue ?? 100;
  const schedule = deps.schedule ?? ((fn, ms) => setTimeout(fn, ms));

  let queue: Queued[] = [];
  let enabled = true;
  let timerSet = false;
  let flushing: Promise<void> | null = null;
  let distinctId: string | null = null;

  async function ensureId(): Promise<string> {
    if (distinctId) return distinctId;
    let id = await deps.loadId().catch(() => null);
    if (!id) {
      id = deps.newId();
      await deps.saveId(id).catch(() => undefined);
    }
    distinctId = id;
    return id;
  }

  function track(name: string, props?: Record<string, unknown>): void {
    const clean = sanitizeProps(props);
    deps.onDev?.(name, clean);
    if (!deps.key || !enabled) return;
    queue.push({ event: name, properties: clean, timestamp: deps.now().toISOString() });
    if (queue.length > maxQueue) queue = queue.slice(queue.length - maxQueue);
    if (queue.length >= flushAt) void flush();
    else if (!timerSet) {
      timerSet = true;
      schedule(() => {
        timerSet = false;
        void flush();
      }, flushAfterMs);
    }
  }

  /** Sends what is queued. A failed send keeps the events for the next attempt (bounded by maxQueue). */
  function flush(): Promise<void> {
    if (flushing) return flushing;
    flushing = (async () => {
      if (!deps.key || queue.length === 0) return;
      const batch = queue;
      queue = [];
      try {
        const id = await ensureId();
        const res = await deps.fetchImpl(`${deps.host.replace(/\/$/, '')}/batch/`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            api_key: deps.key,
            batch: batch.map((e) => ({
              event: e.event,
              timestamp: e.timestamp,
              properties: {
                ...deps.base,
                ...e.properties,
                distinct_id: id,
                $lib: 'dyce-app',
                $process_person_profile: false,
              },
            })),
          }),
        });
        if (!res.ok) throw new Error(`posthog ${res.status}`);
      } catch {
        queue = [...batch, ...queue].slice(-maxQueue);
      }
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  return {
    track,
    flush,
    /** Opt-out (and back in). Turning it off also drops anything not yet sent. */
    setEnabled(value: boolean): void {
      enabled = value;
      if (!value) queue = [];
    },
    isEnabled: () => enabled && deps.key !== null,
    /** Test and debug helper. */
    pending: () => queue.length,
  };
}
