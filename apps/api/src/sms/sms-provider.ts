import { isNigerian, maskPhone } from '@dyce/shared';

/**
 * SMS delivery. Providers receive the raw number only for the instant of sending; they must never
 * log it (use maskPhone) or put it in an error message.
 */
export interface SmsProvider {
  send(toE164: string, body: string): Promise<void>;
}

export class SmsDeliveryError extends Error {
  readonly provider: string;
  constructor(provider: string, detail: string) {
    super(`${provider}: ${detail}`);
    this.name = 'SmsDeliveryError';
    this.provider = provider;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Development only: prints the (masked) destination and the message, including the code. */
export class ConsoleSmsProvider implements SmsProvider {
  async send(toE164: string, body: string): Promise<void> {
    console.log(`[sms:dev] to ${maskPhone(toE164)}: ${body}`);
  }
}

/** Tests: records what would have been sent. */
export class MemorySmsProvider implements SmsProvider {
  readonly sent: { to: string; body: string }[] = [];
  failWith: string | null = null;

  async send(toE164: string, body: string): Promise<void> {
    if (this.failWith) throw new SmsDeliveryError('memory', this.failWith);
    this.sent.push({ to: toE164, body });
  }

  /** The 6-digit code in the most recent message. */
  lastCode(): string {
    const last = this.sent.at(-1);
    const m = last && /\b(\d{6})\b/.exec(last.body);
    if (!m) throw new Error('No OTP sent');
    return m[1]!;
  }
}

export type TermiiConfig = {
  apiKey: string;
  senderId: string;
  /** Account-specific base URL; verify against your Termii dashboard. */
  baseUrl?: string;
  /** "dnd" is the transactional route needed to reach Nigerian numbers with DND enabled. */
  channel?: 'dnd' | 'generic' | 'whatsapp';
};

/** Nigerian numbers (+234). NOT yet exercised against the live Termii API: see docs/DECISIONS.md ADR-007. */
export class TermiiSmsProvider implements SmsProvider {
  constructor(
    private readonly config: TermiiConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async send(toE164: string, body: string): Promise<void> {
    const base = (this.config.baseUrl ?? 'https://api.ng.termii.com').replace(/\/$/, '');
    let res: Response;
    try {
      res = await this.fetchImpl(`${base}/api/sms/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to: toE164.replace(/^\+/, ''), // Termii wants international format without "+"
          from: this.config.senderId,
          sms: body,
          type: 'plain',
          channel: this.config.channel ?? 'dnd',
          api_key: this.config.apiKey,
        }),
      });
    } catch {
      throw new SmsDeliveryError('termii', 'network error');
    }
    if (!res.ok) throw new SmsDeliveryError('termii', `HTTP ${res.status}`);
    const json = (await res.json().catch(() => ({}))) as { code?: string };
    if (json.code !== undefined && json.code !== 'ok') {
      throw new SmsDeliveryError('termii', `rejected (${json.code})`);
    }
  }
}

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  /** Either a sending number or a Messaging Service SID. */
  from?: string;
  messagingServiceSid?: string;
};

export class TwilioSmsProvider implements SmsProvider {
  constructor(
    private readonly config: TwilioConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    if (!config.from && !config.messagingServiceSid) {
      throw new Error('Twilio needs `from` or `messagingServiceSid`');
    }
  }

  async send(toE164: string, body: string): Promise<void> {
    const form = new URLSearchParams({ To: toE164, Body: body });
    if (this.config.messagingServiceSid)
      form.set('MessagingServiceSid', this.config.messagingServiceSid);
    else form.set('From', this.config.from!);
    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString(
      'base64',
    );
    let res: Response;
    try {
      res = await this.fetchImpl(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            authorization: `Basic ${auth}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        },
      );
    } catch {
      throw new SmsDeliveryError('twilio', 'network error');
    }
    if (!res.ok) throw new SmsDeliveryError('twilio', `HTTP ${res.status}`);
  }
}

/**
 * Routing: +234 numbers go to the Nigerian provider first and fall back to the international one;
 * everything else goes to the international provider.
 */
export class RoutedSmsProvider implements SmsProvider {
  constructor(
    private readonly nigeria: SmsProvider | null,
    private readonly international: SmsProvider | null,
    private readonly onFailure: (err: SmsDeliveryError) => void = () => undefined,
  ) {}

  async send(toE164: string, body: string): Promise<void> {
    const chain = (
      isNigerian(toE164) ? [this.nigeria, this.international] : [this.international]
    ).filter((p): p is SmsProvider => p !== null);
    if (chain.length === 0)
      throw new SmsDeliveryError('router', 'no provider configured for this route');
    let last: SmsDeliveryError | undefined;
    for (const provider of chain) {
      try {
        await provider.send(toE164, body);
        return;
      } catch (err) {
        last =
          err instanceof SmsDeliveryError
            ? err
            : new SmsDeliveryError('unknown', 'unexpected error');
        this.onFailure(last);
      }
    }
    throw last!;
  }
}
