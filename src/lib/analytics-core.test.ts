import { createAnalytics, sanitizeProps, type AnalyticsDeps } from './analytics-core';

function setup(over: Partial<AnalyticsDeps> = {}) {
  const sent: { url: string; body: { api_key: string; batch: Record<string, unknown>[] } }[] = [];
  let stored: string | null = null;
  const timers: (() => void)[] = [];
  const deps: AnalyticsDeps = {
    key: 'phc_test',
    host: 'https://eu.i.posthog.com/',
    fetchImpl: ((url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as never,
    loadId: () => Promise.resolve(stored),
    saveId: (id) => {
      stored = id;
      return Promise.resolve();
    },
    newId: () => 'install-1',
    now: () => new Date('2026-11-23T10:00:00Z'),
    base: { platform: 'ios', app_version: '0.1.0', app_env: 'production' },
    schedule: (fn) => void timers.push(fn),
    ...over,
  };
  return { a: createAnalytics(deps), sent, timers, getStored: () => stored };
}

describe('analytics core', () => {
  it('does nothing without a key (no network, nothing queued) but still echoes in development', () => {
    const dev: string[] = [];
    const { a, sent } = setup({ key: null, onDev: (n) => dev.push(n) });
    a.track('signup_started');
    expect(a.pending()).toBe(0);
    expect(sent).toEqual([]);
    expect(dev).toEqual(['signup_started']);
    expect(a.isEnabled()).toBe(false);
  });

  it('batches events, sends them anonymously and stores a random install id', async () => {
    const { a, sent, timers, getStored } = setup();
    a.track('signup_started');
    a.track('contacts_permission', { result: 'granted' });
    expect(sent).toHaveLength(0);
    timers[0]!(); // the delayed flush fires
    await a.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('https://eu.i.posthog.com/batch/');
    expect(sent[0]!.body.api_key).toBe('phc_test');
    const [first, second] = sent[0]!.body.batch as {
      event: string;
      properties: Record<string, unknown>;
    }[];
    expect(first!.event).toBe('signup_started');
    expect(second!.properties).toMatchObject({
      result: 'granted',
      platform: 'ios',
      distinct_id: 'install-1',
      $process_person_profile: false,
    });
    expect(getStored()).toBe('install-1');
  });

  it('flushes at once when the batch is full', async () => {
    const { a, sent } = setup({ flushAt: 3 });
    a.track('a');
    a.track('b');
    a.track('c');
    await a.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body.batch).toHaveLength(3);
  });

  it('keeps events when the send fails, and retries them', async () => {
    let ok = false;
    const { a, sent } = setup({
      fetchImpl: ((url: string, init: RequestInit) => {
        if (ok) sent.push({ url, body: JSON.parse(String(init.body)) });
        return Promise.resolve(new Response('{}', { status: ok ? 200 : 503 }));
      }) as never,
    });
    a.track('x');
    await a.flush();
    expect(a.pending()).toBe(1);
    ok = true;
    await a.flush();
    expect(a.pending()).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('bounds the queue', () => {
    const { a } = setup({ maxQueue: 5, flushAt: 1000 });
    for (let i = 0; i < 20; i++) a.track(`e${i}`);
    expect(a.pending()).toBe(5);
  });

  it('opting out drops the queue and stops capture', async () => {
    const { a, sent } = setup();
    a.track('x');
    a.setEnabled(false);
    a.track('y');
    await a.flush();
    expect(a.pending()).toBe(0);
    expect(sent).toEqual([]);
  });
});

describe('sanitizeProps (defence in depth: never send identifiers)', () => {
  it('drops phone-like, name-like and long values, keeps small primitives', () => {
    expect(
      sanitizeProps({
        game: 'whot',
        mode: 'pool',
        step: 3,
        ok: true,
        phone: '+2348031234567',
        username: 'ada',
        displayName: 'Ada',
        otp: '424242',
        note: 'x'.repeat(200),
        nested: { a: 1 },
        nan: Number.NaN,
      }),
    ).toEqual({ game: 'whot', mode: 'pool', step: 3, ok: true });
  });
});
