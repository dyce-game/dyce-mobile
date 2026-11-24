import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { maskEmail, normalizeEmail, normalizePhone, OTP_LENGTH, queryKeys } from '@dyce/shared';
import { Text, TextField, TokenButton, useTheme } from '@dyce/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { authApi } from '@/lib/api';
import { CodeEntry } from '../components/CodeEntry';
import { PhoneField } from '../components/PhoneField';
import { defaultCountry, spaced, type Country } from '../countries';
import { emailProblem } from '../email-logic';
import { authErrorMessage } from '../messages';

/**
 * Add the other way in to the account you are signed in to (Settings > Account): an email for an account that
 * signed up with a phone, or a phone number for one that signed up with email. The same one-time-code step as
 * signing in; once the code is right it becomes a second way to log in to this same account.
 */
export function LinkIdentityScreen({ kind }: { kind: 'email' | 'phone' }) {
  const router = useRouter();
  const { colors } = useTheme();
  const client = useQueryClient();

  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [country, setCountry] = useState<Country>(defaultCountry);
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState<'enter' | 'code' | 'done'>('enter');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [errorSignal, setErrorSignal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pasted, setPasted] = useState(false);
  const submitting = useRef(false);

  const address = normalizeEmail(email);
  const e164 = normalizePhone(phone, country.code);
  const ready = kind === 'email' ? !!address : !!e164;
  const noun = kind === 'email' ? 'email' : 'phone number';

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/settings' as Href));

  async function sendCode() {
    if (!ready) {
      setTouched(true);
      setError(
        kind === 'email'
          ? (emailProblem(email) ?? 'Enter your email address.')
          : "That doesn't look like a valid mobile number.",
      );
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const res =
        kind === 'email'
          ? await authApi.requestEmailLink(address!)
          : await authApi.requestPhoneLink(phone, country.code);
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
      if (kind === 'email') await authApi.verifyEmailLink(address!, value);
      else await authApi.verifyPhoneLink(phone, value, country.code);
      await client.invalidateQueries({ queryKey: queryKeys.me });
      setStage('done');
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
    if (code.length === 0 && next.length === OTP_LENGTH) setPasted(true);
    setCode(next);
    if (next.length === OTP_LENGTH) void verify(next);
  }

  const backToEntry = () => {
    setStage('enter');
    setError(undefined);
    setCode('');
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.pad}>
          <ScreenHeader
            title={kind === 'email' ? 'Add your email' : 'Add your phone number'}
            fallback="/settings"
          />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {stage === 'done' ? (
            <View style={styles.done} accessibilityLiveRegion="polite">
              <Text variant="title" accessibilityRole="header">
                {kind === 'email' ? 'Email added' : 'Phone number added'}
              </Text>
              <Text color="sub">
                You can now log in to this account with your {noun}
                {kind === 'phone' ? ', and friends in your contacts can find you' : ''}.
              </Text>
            </View>
          ) : (
            <>
              <Text color="sub">
                {stage === 'enter'
                  ? kind === 'email'
                    ? "Add an email so you can also log in with it. We'll email a code to confirm it."
                    : "Add your number so you can also log in with it and friends in your contacts can find you. We'll text a code."
                  : kind === 'email'
                    ? `Code sent to ${maskEmail(address ?? email)}. Look in spam too.`
                    : `Code sent to ${e164 ? spaced(e164) : 'your phone'}`}
              </Text>
              {stage === 'enter' ? (
                kind === 'email' ? (
                  <View style={styles.field}>
                    <TextField
                      label="Email"
                      value={email}
                      onChangeText={(t) => {
                        setEmail(t);
                        setError(undefined);
                      }}
                      placeholder="you@example.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      autoFocus
                      error={error ?? (touched ? (emailProblem(email) ?? undefined) : undefined)}
                      returnKeyType="go"
                      onSubmitEditing={() => void sendCode()}
                    />
                  </View>
                ) : (
                  <PhoneField
                    country={country}
                    onCountry={setCountry}
                    phone={phone}
                    onPhone={(t) => {
                      setPhone(t);
                      setError(undefined);
                    }}
                    error={error}
                    onSubmit={() => void sendCode()}
                  />
                )
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
                  onChange={backToEntry}
                  changeLabel={kind === 'email' ? 'Change email' : 'Change number'}
                />
              )}
            </>
          )}
        </ScrollView>
        <View style={styles.footer}>
          {stage === 'done' ? (
            <TokenButton label="Done" onPress={close} />
          ) : stage === 'enter' ? (
            <TokenButton
              label={busy ? 'Sending…' : 'Send code'}
              onPress={() => void sendCode()}
              disabled={
                busy || (kind === 'email' ? email.trim().length < 3 : phone.trim().length < 5)
              }
            />
          ) : (
            <TokenButton
              label={busy ? 'Checking…' : 'Verify'}
              onPress={() => void verify(code)}
              disabled={busy || code.length !== OTP_LENGTH}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 16 },
  content: { padding: 24, gap: 8 },
  field: { marginTop: 20 },
  done: { gap: 8, paddingTop: 24 },
  footer: { paddingHorizontal: 24, paddingBottom: 12 },
});
