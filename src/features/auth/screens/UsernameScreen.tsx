import { useState } from 'react';
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
import { useMutation, useQuery } from '@tanstack/react-query';
import { usernameSchema } from '@dyce/shared';
import { Icon, Text, TextField, TokenButton, useTheme } from '@dyce/ui';
import { authApi, sessionStore } from '@/lib/api';
import { track } from '@/lib/analytics';
import { ApiError } from '../api-client';
import { AuthHeader } from '../components/AuthHeader';
import { claimInviteAfterSignup } from '@/features/invites/claim';
import { authErrorMessage } from '../messages';
import { hrefForStep } from '../routes';
import { useDebounced } from '../use-debounced';

/**
 * "Claim your @name". Live availability (debounced), format rules shown as you type, suggestions when a
 * name is taken. The display name is optional; the username is what friends search for.
 */
export function UsernameScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [raw, setRaw] = useState('');
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [serverSuggestions, setServerSuggestions] = useState<string[]>([]);

  const typed = raw.replace(/^@/, '');
  const parsed = usernameSchema.safeParse(typed);
  const debounced = useDebounced(parsed.success ? parsed.data : null, 400);
  const settled = parsed.success && debounced === parsed.data;

  const check = useQuery({
    queryKey: ['username-check', debounced],
    queryFn: () => authApi.checkUsername(debounced!),
    enabled: debounced !== null,
    staleTime: 10_000,
    retry: false,
  });

  const create = useMutation({
    mutationFn: () =>
      authApi.createProfile(parsed.success ? parsed.data : '', displayName.trim() || undefined),
    onSuccess: async (me) => {
      sessionStore.getState().setNextStep(me.nextStep);
      track({ name: 'signup_completed', step: 'username' });
      // The profile exists now: join any invite that was texted to this number (never blocks sign-up).
      await claimInviteAfterSignup();
      router.replace(hrefForStep(me.nextStep) as Href);
    },
    onError: (err) => {
      setSubmitError(authErrorMessage(err));
      if (err instanceof ApiError && Array.isArray(err.details.suggestions)) {
        setServerSuggestions(err.details.suggestions as string[]);
      }
    },
  });

  // What to tell the user about the name they've typed.
  let status: 'empty' | 'invalid' | 'checking' | 'available' | 'taken' | 'error' = 'empty';
  let message: string | undefined;
  if (typed.length > 0) {
    if (!parsed.success) {
      status = 'invalid';
      message = parsed.error.issues[0]?.message;
    } else if (!settled || check.isFetching) {
      status = 'checking';
    } else if (check.isError) {
      status = 'error';
      message = authErrorMessage(check.error);
    } else if (check.data?.available) {
      status = 'available';
      message = `@${parsed.data} is yours`;
    } else if (check.data) {
      status = 'taken';
      message = `@${parsed.data} is taken`;
    }
  }

  const suggestions = status === 'taken' ? (check.data?.suggestions ?? []) : serverSuggestions;
  const canContinue = status === 'available' && !create.isPending;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AuthHeader step={2} />
          <Text variant="title" accessibilityRole="header" style={styles.title}>
            Claim your @name
          </Text>
          <Text color="sub">This is how people find and challenge you in Space.</Text>

          <View style={styles.form}>
            <TextField
              label="Display name"
              hint="Optional"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              maxLength={40}
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
            />
            <TextField
              label="Username"
              value={raw}
              onChangeText={(t) => {
                setRaw(t);
                setSubmitError(undefined);
                setServerSuggestions([]);
              }}
              placeholder="kemdi.plays"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username-new"
              maxLength={21}
              autoFocus
              error={
                status === 'invalid' || status === 'taken' || status === 'error'
                  ? message
                  : submitError
              }
              leading={
                <Text color="sub" variant="callout">
                  @
                </Text>
              }
              trailing={
                status === 'available' ? (
                  <View
                    style={[styles.badge, { backgroundColor: colors.money }]}
                    accessibilityLabel="Available"
                  >
                    <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />
                  </View>
                ) : status === 'checking' ? (
                  <Text color="sub" variant="footnote">
                    …
                  </Text>
                ) : null
              }
            />
            {status === 'available' ? (
              <Text color="money" variant="callout" accessibilityLiveRegion="polite">
                {message}
              </Text>
            ) : null}

            {suggestions.length > 0 ? (
              <View style={styles.suggest}>
                <Text variant="footnote" color="sub">
                  Or grab one of these
                </Text>
                <View style={styles.chips}>
                  {suggestions.map((s) => (
                    <Pressable
                      key={s}
                      accessibilityRole="button"
                      accessibilityLabel={`Use @${s}`}
                      onPress={() => {
                        setRaw(s);
                        setServerSuggestions([]);
                        setSubmitError(undefined);
                      }}
                      style={[styles.chip, { borderColor: colors.line }]}
                    >
                      <Text>@{s}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TokenButton
            label={create.isPending ? 'Saving…' : 'Continue'}
            tone="ember"
            disabled={!canContinue}
            onPress={() => create.mutate()}
          />
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
  form: { marginTop: 20, gap: 16 },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggest: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
  footer: { paddingHorizontal: 24, paddingBottom: 12 },
});
