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
import { getLocales } from 'expo-localization';
import { SafeAreaView } from 'react-native-safe-area-context';
import { normalizePhone, OTP_LENGTH, regionOf } from '@dyce/shared';
import { OtpInput, Text, TextField, TokenButton, useTheme } from '@dyce/ui';
import { authApi, sessionStore } from '@/lib/api';
import { track } from '@/lib/analytics';
import { AuthHeader } from '../components/AuthHeader';
import { getPendingInvite } from '@/features/invites/pending-invite';
import { splitDial } from '@/features/invites/invite-link';
import { authErrorMessage } from '../messages';
import { hrefForStep } from '../routes';

type Country = { code: string; dial: string; name: string };
const COUNTRIES: Country[] = [
  { code: 'NG', dial: '+234', name: 'Nigeria' },
  { code: 'GH', dial: '+233', name: 'Ghana' },
  { code: 'KE', dial: '+254', name: 'Kenya' },
  { code: 'ZA', dial: '+27', name: 'South Africa' },
  { code: 'GB', dial: '+44', name: 'United Kingdom' },
  { code: 'US', dial: '+1', name: 'United States' },
  { code: 'CA', dial: '+1', name: 'Canada' },
  { code: 'AE', dial: '+971', name: 'UAE' },
];

/** Country picker defaults to the device's region, falling back to Nigeria. */
function defaultCountry(): Country {
  const region = getLocales()[0]?.regionCode?.toUpperCase();
  return COUNTRIES.find((c) => c.code === region) ?? COUNTRIES[0]!;
}

function spaced(e164: string): string {
  const m = /^(\+\d{1,3})(\d{3})(\d{3})(\d+)$/.exec(e164);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

/**
 * Phone number, then the 6-digit code, on one screen (as designed). Signing in and signing up are the
 * same flow: a new number simply creates an account when its code is verified.
 */
export function PhoneScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [country, setCountry] = useState<Country>(defaultCountry);
  const [pickerOpen, setPickerOpen] = useState(false);
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
            <View style={styles.form}>
              <TextField
                label="Phone"
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  setError(undefined);
                }}
                placeholder="803 412 7781"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                autoFocus
                error={error}
                returnKeyType="go"
                onSubmitEditing={() => void sendCode()}
                leading={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Country: ${country.name} ${country.dial}. Change`}
                    onPress={() => setPickerOpen((o) => !o)}
                    style={styles.country}
                  >
                    <Text variant="callout">
                      {country.code} {country.dial}
                    </Text>
                  </Pressable>
                }
              />
              {pickerOpen ? (
                <View
                  style={[
                    styles.picker,
                    { backgroundColor: colors.card, borderColor: colors.line },
                  ]}
                >
                  {COUNTRIES.map((c) => (
                    <Pressable
                      key={c.code}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.name} ${c.dial}`}
                      onPress={() => {
                        setCountry(c);
                        setPickerOpen(false);
                        setError(undefined);
                      }}
                      style={styles.pickerRow}
                    >
                      <Text variant="callout" color={c.code === country.code ? 'accent' : 'text'}>
                        {c.name}
                      </Text>
                      <Text color="sub">{c.dial}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.form}>
              <OtpInput
                value={code}
                onChange={onCodeChange}
                errorSignal={errorSignal}
                disabled={busy}
                autoFocus
              />
              {error ? (
                <Text color="accent" variant="footnote" accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : pasted && code.length === OTP_LENGTH ? (
                <Text color="money" variant="footnote">
                  Code filled in
                </Text>
              ) : null}
              <View style={styles.resend}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change number"
                  onPress={back}
                  style={styles.link}
                >
                  <Text color="accent" variant="callout">
                    Change number
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    secondsLeft > 0 ? `Resend code in ${secondsLeft} seconds` : 'Resend code'
                  }
                  accessibilityState={{ disabled: secondsLeft > 0 || busy }}
                  disabled={secondsLeft > 0 || busy}
                  onPress={() => void sendCode()}
                  style={styles.link}
                >
                  <Text color={secondsLeft > 0 ? 'sub' : 'accent'} variant="callout">
                    {secondsLeft > 0
                      ? `Resend in 0:${String(secondsLeft).padStart(2, '0')}`
                      : 'Resend code'}
                  </Text>
                </Pressable>
              </View>
            </View>
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
  form: { marginTop: 20, gap: 12 },
  country: { minHeight: 44, justifyContent: 'center', paddingRight: 8 },
  picker: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  pickerRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resend: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { minHeight: 44, justifyContent: 'center' },
  footer: { paddingHorizontal: 24, paddingBottom: 12, gap: 10 },
  fine: { textAlign: 'center' },
});
