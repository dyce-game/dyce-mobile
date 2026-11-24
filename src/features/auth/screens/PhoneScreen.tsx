import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { normalizePhone, OTP_LENGTH, regionOf } from '@dyce/shared';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { authApi, sessionStore } from '@/lib/api';
import { track } from '@/lib/analytics';
import { AuthHeader } from '../components/AuthHeader';
import { CodeEntry } from '../components/CodeEntry';
import { PhoneField } from '../components/PhoneField';
import { getPendingInvite } from '@/features/invites/pending-invite';
import { splitDial } from '@/features/invites/invite-link';
import { COUNTRIES, defaultCountry, spaced, type Country } from '../countries';
import { authErrorMessage } from '../messages';
import { hrefForStep } from '../routes';
import { useAuthMethods } from '../use-auth-methods';

/**
 * Phone number, then the 6-digit code, on one screen (as designed). Signing in and signing up are the
 * same flow: a new number simply creates an account when its code is verified. "Use email instead" (when the
 * server offers it) leads to the same flow with an address.
 */
export function PhoneScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const methods = useAuthMethods();
  const [country, setCountry] = useState<Country>(defaultCountry);
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [errorSignal, setErrorSignal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pasted, setPasted] = useState(false);
  const submitting = useRef(false);

  const e164 = normalizePhone(phone, country.code);

  // Arrived from an invite link: start with the number the invite was texted to (it never left this device).
  useEffect(() => {
    let alive = true;
    void getPendingInvite().then((invite) => {
      if (!alive || !invite?.phone) return;
      const split = splitDial(
        invite.phone,
        COUNTRIES.map((c) => c.dial),
      );
      if (!split) return;
      setCountry(COUNTRIES.find((c) => c.dial === split.dial) ?? COUNTRIES[0]!);
      setPhone((current) => (current === '' ? split.national : current));
    });
    return () => {
      alive = false;
    };
  }, []);

  // resend countdown
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  async function sendCode() {
    if (!e164) {
      setError("That doesn't look like a valid mobile number.");
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const res = await authApi.requestOtp(phone, country.code);
      if (stage === 'phone') track({ name: 'signup_started' });
      setStage('code');
      setCode('');
      setPasted(false);
      setSecondsLeft(res.resendAfterSeconds);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const session = await authApi.verifyOtp(phone, value, country.code);
      // Remember the phone's country (not the number) so contacts in national format can be read correctly.
      await sessionStore
        .getState()
        .signIn(session, e164 ? (regionOf(e164) ?? country.code) : country.code);
      track({ name: 'signup_completed', step: 'phone' });
      router.replace(hrefForStep(session.nextStep) as Href);
    } catch (err) {
      setError(authErrorMessage(err));
      setCode('');
      setErrorSignal((n) => n + 1);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function onCodeChange(next: string) {
    // 0 -> 6 digits in one change means paste or SMS autofill
    if (code.length === 0 && next.length === OTP_LENGTH) setPasted(true);
    setCode(next);
    if (next.length === OTP_LENGTH) void verify(next);
  }

  const back = () => {
    if (stage === 'code') {
      setStage('phone');
      setError(undefined);
      setCode('');
    } else router.back();
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AuthHeader step={1} onBack={back} />
          <Text variant="title" accessibilityRole="header" style={styles.title}>
            {stage === 'phone' ? "What's your number?" : 'Enter your code'}
          </Text>
          <Text color="sub">
            {stage === 'phone'
              ? "We'll text a code. It fills itself in. No passwords, ever."
              : `Code sent to ${e164 ? spaced(e164) : 'your phone'}`}
          </Text>

          {stage === 'phone' ? (
            <>
              <PhoneField
                country={country}
                onCountry={(c) => {
                  setCountry(c);
                  setError(undefined);
                }}
                phone={phone}
                onPhone={(t) => {
                  setPhone(t);
                  setError(undefined);
                }}
                error={error}
                onSubmit={() => void sendCode()}
              />
              {methods.email ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Use email instead"
                  onPress={() => router.replace('/email?mode=signup' as Href)}
                  style={styles.alt}
                >
                  <Text color="accent" variant="callout">
                    Use email instead
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <CodeEntry
              code={code}
              onCodeChange={onCodeChange}
              busy={busy}
              error={error}
              errorSignal={errorSignal}
              pasted={pasted}
              secondsLeft={secondsLeft}
              onResend={() => void sendCode()}
              onChange={back}
              changeLabel="Change number"
            />
          )}
        </ScrollView>

        <View style={styles.footer}>
          {stage === 'phone' ? (
            <TokenButton
              label={busy ? 'Sending…' : 'Continue'}
              onPress={() => void sendCode()}
              disabled={busy || phone.trim().length < 5}
            />
          ) : (
            <TokenButton
              label={busy ? 'Checking…' : 'Verify'}
              onPress={() => void verify(code)}
              disabled={busy || code.length !== OTP_LENGTH}
            />
          )}
          <Text variant="footnote" color="sub" style={styles.fine}>
            Same screen logs you back in. Your number stays private; friends find you by @username.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 24, gap: 8 },
  title: { marginTop: 16 },
  alt: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  footer: { paddingHorizontal: 24, paddingBottom: 12, gap: 10 },
  fine: { textAlign: 'center' },
});
