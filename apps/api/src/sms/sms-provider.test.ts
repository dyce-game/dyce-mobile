import {
  ConsoleSmsProvider,
  MemorySmsProvider,
  RoutedSmsProvider,
  SmsDeliveryError,
  TermiiSmsProvider,
  TwilioSmsProvider,
} from './sms-provider.ts';

const NG = '+2348031234567';
const UK = '+447911123456';

type Call = { url: string; init: RequestInit };
function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return respond();
  };
  return { fn, calls };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('TermiiSmsProvider', () => {
  const config = { apiKey: 'secret-key', senderId: 'Dyce' };

  it('posts the documented JSON shape with the number in international format without "+"', async () => {
    const { fn, calls } = fakeFetch(() => json({ code: 'ok', message_id: 'm1' }));
    await new TermiiSmsProvider(config, fn).send(NG, 'Your Dyce code is 123456');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.ng.termii.com/api/sms/send');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      to: '2348031234567',
      from: 'Dyce',
      sms: 'Your Dyce code is 123456',
      type: 'plain',
      channel: 'dnd',
      api_key: 'secret-key',
    });
  });

  it('honours a custom base URL and channel', async () => {
    const { fn, calls } = fakeFetch(() => json({ code: 'ok' }));
    await new TermiiSmsProvider(
      { ...config, baseUrl: 'https://v3.api.termii.com/', channel: 'generic' },
      fn,
    ).send(NG, 'x');
    expect(calls[0]!.url).toBe('https://v3.api.termii.com/api/sms/send');
    expect(JSON.parse(calls[0]!.init.body as string).channel).toBe('generic');
  });

  it.each([
    ['HTTP error', () => json({}, 500)],
    ['rejection code', () => json({ code: 'insufficient_balance' })],
  ])('fails on %s without leaking the number, message or key', async (_name, respond) => {
    const { fn } = fakeFetch(respond);
    const err = await new TermiiSmsProvider(config, fn).send(NG, 'code 123456').catch((e) => e);
    expect(err).toBeInstanceOf(SmsDeliveryError);
    expect(err.message).not.toContain('8031234567');
    expect(err.message).not.toContain('123456');
    expect(err.message).not.toContain('secret-key');
  });

  it('turns a network failure into a delivery error', async () => {
    const fn = async () => {
      throw new Error('ECONNRESET to 2348031234567');
    };
    const err = await new TermiiSmsProvider(config, fn).send(NG, 'x').catch((e) => e);
    expect(err).toBeInstanceOf(SmsDeliveryError);
    expect(err.message).not.toContain('8031234567');
  });
});

describe('TwilioSmsProvider', () => {
  const config = { accountSid: 'ACxxx', authToken: 'tok', from: '+15005550006' };

  it('posts form data with Basic auth', async () => {
    const { fn, calls } = fakeFetch(() => json({ sid: 'SM1' }, 201));
    await new TwilioSmsProvider(config, fn).send(UK, 'hello');
    const call = calls[0]!;
    expect(call.url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages.json');
    const headers = call.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from('ACxxx:tok').toString('base64')}`);
    const form = new URLSearchParams(call.init.body as string);
    expect(form.get('To')).toBe(UK);
    expect(form.get('From')).toBe('+15005550006');
    expect(form.get('Body')).toBe('hello');
  });

  it('prefers a messaging service when configured', async () => {
    const { fn, calls } = fakeFetch(() => json({}, 201));
    await new TwilioSmsProvider(
      { accountSid: 'AC', authToken: 't', messagingServiceSid: 'MG1' },
      fn,
    ).send(UK, 'x');
    const form = new URLSearchParams(calls[0]!.init.body as string);
    expect(form.get('MessagingServiceSid')).toBe('MG1');
    expect(form.has('From')).toBe(false);
  });

  it('needs a from number or messaging service', () => {
    expect(() => new TwilioSmsProvider({ accountSid: 'AC', authToken: 't' })).toThrow();
  });

  it('fails on a non-2xx response', async () => {
    const { fn } = fakeFetch(() => json({}, 400));
    await expect(new TwilioSmsProvider(config, fn).send(UK, 'x')).rejects.toBeInstanceOf(
      SmsDeliveryError,
    );
  });
});

describe('RoutedSmsProvider', () => {
  it('sends +234 numbers through the Nigerian provider only when it works', async () => {
    const ng = new MemorySmsProvider();
    const intl = new MemorySmsProvider();
    await new RoutedSmsProvider(ng, intl).send(NG, 'hi');
    expect(ng.sent).toHaveLength(1);
    expect(intl.sent).toHaveLength(0);
  });

  it('falls back to the international provider when the Nigerian one fails', async () => {
    const ng = new MemorySmsProvider();
    ng.failWith = 'down';
    const intl = new MemorySmsProvider();
    const failures: SmsDeliveryError[] = [];
    await new RoutedSmsProvider(ng, intl, (e) => failures.push(e)).send(NG, 'hi');
    expect(intl.sent).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });

  it('sends non-Nigerian numbers through the international provider, never the Nigerian one', async () => {
    const ng = new MemorySmsProvider();
    const intl = new MemorySmsProvider();
    await new RoutedSmsProvider(ng, intl).send(UK, 'hi');
    expect(intl.sent).toHaveLength(1);
    expect(ng.sent).toHaveLength(0);
  });

  it('fails clearly when nothing can send', async () => {
    await expect(new RoutedSmsProvider(null, null).send(NG, 'hi')).rejects.toBeInstanceOf(
      SmsDeliveryError,
    );
    const bad = new MemorySmsProvider();
    bad.failWith = 'down';
    await expect(new RoutedSmsProvider(bad, null).send(NG, 'hi')).rejects.toBeInstanceOf(
      SmsDeliveryError,
    );
    await expect(new RoutedSmsProvider(bad, null).send(UK, 'hi')).rejects.toBeInstanceOf(
      SmsDeliveryError,
    ); // no intl
  });
});

describe('ConsoleSmsProvider', () => {
  it('masks the number when logging', async () => {
    const lines: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((m: string) => void lines.push(m));
    await new ConsoleSmsProvider().send(NG, 'Your Dyce code is 123456');
    spy.mockRestore();
    expect(lines[0]).toContain('123456');
    expect(lines[0]).not.toContain('8031234567');
    expect(lines[0]).toContain('4567');
  });
});
