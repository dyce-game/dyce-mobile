import { scrubBreadcrumb, scrubEvent } from './monitoring-scrub';

describe('monitoring scrub', () => {
  it('removes request data, user fields and phone numbers from an event', () => {
    const event = scrubEvent({
      message: 'verify failed for +2348031234567',
      request: {
        url: 'https://api.dyce.games/auth/verify?phone=%2B2348031234567',
        headers: { authorization: 'Bearer abcdef123456' },
        data: { phone: '+2348031234567' },
      },
      user: { id: 'opaque-1', ip_address: '1.2.3.4', username: 'ada', email: 'a@b.c' },
      exception: { values: [{ value: 'Network error for 08031234567' }] },
      breadcrumbs: [{ message: 'GET /x?token=abcd1234', data: { url: '/x?token=abcd1234' } }],
      extra: { refreshToken: 'secret', note: 'ok' },
    });
    expect(event.request).toEqual({ url: 'https://api.dyce.games/auth/verify' });
    expect(event.user).toEqual({ id: 'opaque-1' });
    const text = JSON.stringify(event);
    for (const secret of [
      '2348031234567',
      '08031234567',
      'abcdef123456',
      'abcd1234',
      'secret',
      'ada',
      'a@b.c',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('ok');
  });

  it('cuts query strings from breadcrumb urls', () => {
    const c = scrubBreadcrumb({ category: 'fetch', data: { url: '/a?b=1', method: 'GET' } });
    expect((c.data as Record<string, unknown>).url).toBe('/a');
  });
});
