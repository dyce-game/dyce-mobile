import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TokenButton, brand, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { hrefForStep } from '@/features/auth/routes';
import { track } from '@/lib/analytics';
import { authApi, sessionStore } from '@/lib/api';
import { askPushPermission, registerDevice } from './push';

const SAMPLE = [
  { t: 'Refund', d: 'Ð500 is back in your wallet', time: '1h', x: 30, y: 64, s: 0.9, op: 0.55 },
  {
    t: 'Tunde matched Ð1,000',
    d: 'Sea Battle pot is Ð2,000. Game on.',
    time: '5m',
    x: 22,
    y: 134,
    s: 0.95,
    op: 0.8,
  },
  { t: 'Your move', d: 'Amaka played in 8 Ball. Free.', time: 'now', x: 16, y: 208, s: 1, op: 1 },
];

/**
 * Notifications ask (design: NotifPermission), the last onboarding step. We explain first, then show the phone's
 * own prompt; either answer moves on (it can be changed later in Settings). The cards are a picture of what a push
 * looks like, not real messages. On the web build there is no push, so the button just continues.
 */
export function NotifPermissionScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const native = Platform.OS !== 'web';

  async function finish(allow: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      if (allow && native) {
        const result = await askPushPermission();
        if (result === 'granted') await registerDevice();
      }
      const res = await authApi.completeStep('notifications');
      track({ name: 'signup_completed', step: 'notifications' });
      sessionStore.getState().setNextStep(res.nextStep);
      router.replace(hrefForStep(res.nextStep) as Href);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.stage, { backgroundColor: colors.brandSoft }]} aria-hidden>
        {SAMPLE.map((n) => (
          <View
            key={n.t}
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                left: n.x,
                right: n.x,
                top: n.y,
                opacity: n.op,
                transform: [{ scale: n.s }],
              },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: brand.ember.fill }]} />
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{n.t}</Text>
                <Text color="sub" style={styles.cardTime}>
                  {n.time}
                </Text>
              </View>
              <Text color="sub" style={styles.cardText} numberOfLines={1}>
                {n.d}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.title} accessibilityRole="header">
        Know the second it&apos;s your turn
      </Text>
      <Text color="sub" style={styles.body}>
        Turns, pool matches and refunds. Games time out after 24 hours, so a nudge keeps you from
        forfeiting.
      </Text>
      <Text color="sub" style={styles.note}>
        You choose which ones later in Settings, and you can set quiet hours. We never send promos
        at night.
      </Text>
      {error ? (
        <Text color="accent" accessibilityLiveRegion="polite" style={styles.note}>
          {error}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <TokenButton
          label={busy ? 'One moment…' : native ? 'Turn on notifications' : 'Continue'}
          tone="ember"
          disabled={busy}
          onPress={() => void finish(true)}
        />
        {native ? (
          <TokenButton
            label="Not now"
            tone="chip"
            disabled={busy}
            onPress={() => void finish(false)}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, paddingBottom: 12 },
  stage: { height: 300, marginTop: 20, borderRadius: 32, overflow: 'hidden' },
  card: {
    position: 'absolute',
    borderRadius: 20,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    boxShadow: '0px 10px 30px rgba(90,30,10,0.14)',
  },
  icon: { width: 38, height: 38, borderRadius: 10 },
  cardBody: { flex: 1, minWidth: 0 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
  cardTime: { fontSize: 11 },
  cardText: { fontSize: 13 },
  title: {
    fontSize: 30,
    lineHeight: 33,
    letterSpacing: -0.5,
    marginTop: 24,
    marginBottom: 8,
    fontFamily: 'BricolageGrotesque_700Bold',
  },
  body: { fontSize: 16, lineHeight: 23 },
  note: { fontSize: 13, lineHeight: 19, marginTop: 12 },
  footer: { marginTop: 'auto', gap: 8 },
});
