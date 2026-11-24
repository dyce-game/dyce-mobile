import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { normalizeEmail, OTP_LENGTH } from '@dyce/shared';
import { Text, TextField, TokenButton, useTheme } from '@dyce/ui';
import { authApi, sessionStore } from '@/lib/api';
import { track } from '@/lib/analytics';
import { AuthHeader } from '../components/AuthHeader';
import { CodeEntry } from '../components/CodeEntry';
import { cleanEmail, emailCopy, emailProblem, parseEmailMode } from '../email-logic';
import { authErrorMessage } from '../messages';
import { hrefForStep } from '../routes';

/**
 * Email, then the 6-digit code (Sign up with email / Log in with email). Same promise as the phone: signing in and
 * signing up are one flow, and a new address creates an account when its code is verified. The code is emailed
 * through Resend by the server; the address is never kept in the clear (ADR-044).
 */
export function EmailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = parseEmailMode(params.mode);
  const copy = emailCopy(mode);

  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [errorSignal, setErrorSignal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pasted, setPasted] = useState(false);
  const submitting = useRef(false);

  const address = normalizeEmail(email);
  const problem = touched ? emailProblem(email) : null;

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  async function sendCode() {
    if (!address) {
      setTouched(true);
      setError(emailProblem(email) ?? 'Enter your email address.');
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const res = await authApi.requestEmailOtp(address);
      if (stage === 'email') track({ name: 'signup_started' });
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
    if (submitting.current || !address) return;
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const session = await authApi.verifyEmailOtp(address, value);
      // No phone, so no phone country to remember.
      await sessionStore.getState().signIn(session, null);
      track({ name: 'signup_completed', step: 'email' });
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
    // 0 -> 6 digits in one change means paste or autofill from the mail app
    if (code.length === 0 && next.length === OTP_LENGTH) setPasted(true);
    setCode(next);
    if (next.length === OTP_LENGTH) void verify(next);
  }

  const back = () => {
    if (stage === 'code') {
      setStage('email');
      setError(undefined);
      setCode('');
    } else if (router.canGoBack()) router.back();
    else router.replace('/welcome' as Href);
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
            {stage === 'email' ? copy.title : 'Check your email'}
          </Text>
          <Text color="sub">
            {stage === 'email'
              ? copy.intro
              : `${copy.sentTo(cleanEmail(email))}. It can take a minute; look in spam too.`}
          </Text>

          {stage === 'email' ? (
            <View style={styles.form}>
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
                error={error ?? problem ?? undefined}
                returnKeyType="go"
                onSubmitEditing={() => void sendCode()}
              />
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Use your phone number instead"
                onPress={() => router.replace('/phone' as Href)}
                style={styles.alt}
              >
                <Text color="accent" variant="callout">
                  Use your phone number instead
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={copy.switchLabel}
                onPress={() => router.setParams({ mode: copy.switchTo })}
                style={styles.alt}
              >
                <Text color="sub" variant="callout">
                  {copy.switchLabel}
                </Text>
              </Pressable>
            </View>
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
              changeLabel="Change email"
            />
          )}
        </ScrollView>

        <View style={styles.footer}>
          {stage === 'email' ? (
            <TokenButton
              label={busy ? 'Sending…' : 'Continue'}
              onPress={() => void sendCode()}
              disabled={busy || email.trim().length < 3}
            />
          ) : (
            <TokenButton
              label={busy ? 'Checking…' : 'Verify'}
              onPress={() => void verify(code)}
              disabled={busy || code.length !== OTP_LENGTH}
            />
          )}
          <Text variant="footnote" color="sub" style={styles.fine}>
            {copy.footnote}
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
  form: { marginTop: 20, gap: 4 },
  alt: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  footer: { paddingHorizontal: 24, paddingBottom: 12, gap: 10 },
  fine: { textAlign: 'center' },
});
