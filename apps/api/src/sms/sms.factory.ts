import { hasTermii, hasTwilio, type Env } from '../config/env.ts';
import {
  ConsoleSmsProvider,
  RoutedSmsProvider,
  TermiiSmsProvider,
  TwilioSmsProvider,
  type SmsDeliveryError,
  type SmsProvider,
} from './sms-provider.ts';

/** Builds the SMS provider from validated config. Env validation already guarantees a safe combination. */
export function buildSmsProvider(
  env: Env,
  onFailure: (err: SmsDeliveryError) => void = () => undefined,
): SmsProvider {
  if (env.SMS_DRIVER === 'console') return new ConsoleSmsProvider();

  const nigeria = hasTermii(env)
    ? new TermiiSmsProvider({
        apiKey: env.TERMII_API_KEY!,
        senderId: env.TERMII_SENDER_ID!,
        baseUrl: env.TERMII_BASE_URL,
        channel: env.TERMII_CHANNEL,
      })
    : null;
  const international = hasTwilio(env)
    ? new TwilioSmsProvider({
        accountSid: env.TWILIO_ACCOUNT_SID!,
        authToken: env.TWILIO_AUTH_TOKEN!,
        from: env.TWILIO_FROM,
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
      })
    : null;
  return new RoutedSmsProvider(nigeria, international, onFailure);
}
