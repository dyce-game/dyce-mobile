import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ClientStep, NextStep } from '@dyce/shared';
import { formatNaira, kobo } from '@dyce/shared';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { authApi, sessionStore } from '@/lib/api';
import { track } from '@/lib/analytics';
import { authErrorMessage } from '../messages';
import { hrefForStep } from '../routes';

const COPY: Record<
  Exclude<NextStep, 'username' | 'done'>,
  { title: string; body: string; owner: string }
> = {
  contacts: {
    title: 'Find your friends',
    body: 'Dyce will check your contacts for people already here. Numbers are hashed on our server and never stored.',
    owner: 'Contacts matching is the next slice of the auth work.',
  },
  avatar: {
    title: 'Pick your look',
    body: 'Choose a starter look, then customise it.',
    owner: 'The avatar builder is owned by the avatar work.',
  },
  bonus: {
    title: 'Your first ₦200,000',
    body: 'Every player starts with Dyce Cash to play with. It is virtual: it cannot be bought or withdrawn.',
    owner: '',
  },
  notifications: {
    title: 'Never miss your turn',
    body: "We'll ping you when it's your move or a friend challenges you.",
    owner: 'The notification permission prompt arrives with push notifications.',
  },
};

/**
 * Placeholder for the onboarding steps whose real screens belong to other work. Each can be skipped so the
 * whole flow can be walked end to end today; the welcome bonus is real and idempotent.
 */
export function OnboardingStepScreen({ step }: { step: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (step !== 'contacts' && step !== 'avatar' && step !== 'bonus' && step !== 'notifications') {
    router.replace('/chat' as Href);
    return null;
  }
  const stepKey: 'contacts' | 'avatar' | 'bonus' | 'notifications' = step; // narrowed by the guard above
  const copy = COPY[stepKey];

  async function advance(next: NextStep) {
    sessionStore.getState().setNextStep(next);
    router.replace(hrefForStep(next) as Href);
  }

  async function run() {
    setBusy(true);
    setError(undefined);
    try {
      if (stepKey === 'bonus') {
        const res = await authApi.claimWelcomeBonus();
        track({ name: 'signup_completed', step: 'bonus' });
        await advance(res.nextStep);
      } else {
        const res = await authApi.completeStep(stepKey as ClientStep);
        track({ name: 'signup_completed', step: stepKey });
        await advance(res.nextStep);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.body}>
        <Text variant="title" accessibilityRole="header">
          {copy.title}
        </Text>
        <Text color="sub">{copy.body}</Text>
        {step === 'bonus' ? (
          <Text variant="display" color="money">
            {formatNaira(kobo(20_000_000), { compact: true })}
          </Text>
        ) : (
          <Text variant="footnote" color="sub">
            {copy.owner}
          </Text>
        )}
        {error ? (
          <Text color="accent" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
      <View style={styles.footer}>
        <TokenButton
          label={
            step === 'bonus'
              ? busy
                ? 'Claiming…'
                : 'Claim it'
              : busy
                ? 'One moment…'
                : 'Skip for now'
          }
          tone={step === 'bonus' ? 'brass' : 'ember'}
          disabled={busy}
          onPress={() => void run()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24 },
  body: { flex: 1, justifyContent: 'center', gap: 12 },
  footer: { paddingBottom: 12 },
});
