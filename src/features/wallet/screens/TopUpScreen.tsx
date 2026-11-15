import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira } from '@dyce/shared';
import { Icon, Text, useTheme } from '@dyce/ui';
import { Gradient } from '@/components/Gradient';
import { authErrorMessage } from '@/features/auth/messages';
import { weekdayLetter } from '../wallet-logic';
import { useClaimTopup, useWalletQuery, useWeeklyQuery } from '../use-wallet';

const READY = [
  [0, '#F07A4A'],
  [0.55, '#A8321A'],
  [1, '#4A150A'],
] as const;
const DONE = [
  [0, '#3DDC84'],
  [0.55, '#13985A'],
  [1, '#06502E'],
] as const;
const QUIET = [
  [0, '#6F655B'],
  [1, '#2E2823'],
] as const;

/**
 * The daily top-up (design: TopUp). A hero that says whether it's ready, claimed or not needed, your balance
 * now and when the next one is, this week's days, and a Claim button. The amount, the threshold and "under X"
 * come from the server's config, not the design's sample numbers.
 */
export function TopUpScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const wallet = useWalletQuery();
  const weekly = useWeeklyQuery();
  const claim = useClaimTopup();

  const w = wallet.data;
  const claimedNow = claim.isSuccess;
  const todayClaimed = (weekly.data?.days.at(-1)?.topupKobo ?? 0) > 0;
  const done = claimedNow || todayClaimed;
  const ready = !!w?.topup.available && !done;
  const amount = formatNaira(w?.topup.amountKobo ?? 0);
  const state = done ? 'done' : ready ? 'ready' : 'quiet';

  const hero = {
    ready: {
      stops: READY,
      kicker: 'YOUR DAILY TOP-UP IS READY',
      line: `You're under ${formatNaira(w?.topup.thresholdKobo ?? 0)}, so it's on us`,
    },
    done: { stops: DONE, kicker: 'ADDED TO YOUR WALLET', line: 'Go win it back up' },
    quiet: {
      stops: QUIET,
      kicker: 'NO TOP-UP NEEDED RIGHT NOW',
      line: `It opens when you're under ${formatNaira(w?.topup.thresholdKobo ?? 0)}`,
    },
  }[state];

  const days = weekly.data?.days ?? [];
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/wallet' as Href));

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Wallet"
          onPress={goBack}
          style={styles.back}
        >
          <Icon name="back" color={colors.accent} />
          <Text style={[styles.backText, { color: colors.accent }]}>Wallet</Text>
        </Pressable>

        <Gradient stops={hero.stops} radial={{ cx: 0.3, cy: 0.2 }} radius={30} style={styles.hero}>
          <View style={[styles.circle, styles.circleA]} aria-hidden />
          <View style={[styles.circle, styles.circleB]} aria-hidden />
          <Text style={styles.kicker} accessibilityLiveRegion="polite">
            {hero.kicker}
          </Text>
          <Text style={styles.heroAmount}>+{amount}</Text>
          <Text style={styles.heroLine}>{hero.line}</Text>
        </Gradient>

        <View style={[styles.panel, { backgroundColor: colors.bg2 }]}>
          <View>
            <Text style={styles.panelLabel} color="sub">
              Balance now
            </Text>
            <Text style={styles.panelValue}>
              {formatNaira(
                claimedNow
                  ? (claim.data?.balanceKobo ?? w?.balanceKobo ?? 0)
                  : (w?.balanceKobo ?? 0),
              )}
            </Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.panelLabel} color="sub">
              Next top-up
            </Text>
            <Text style={styles.panelValue}>
              {ready ? 'Ready now' : done ? 'Tomorrow' : 'When you run low'}
            </Text>
          </View>
        </View>

        <Text style={styles.weekTitle} color="sub">
          This week
        </Text>
        <View style={styles.week}>
          {days.map((d, i) => {
            const isToday = i === days.length - 1;
            const got = d.topupKobo > 0;
            const showToday = isToday && ready;
            const bg = got ? colors.moneySoft : showToday ? '#C93E1C' : colors.chip;
            const fg = got ? colors.money : showToday ? '#FFFFFF' : colors.sub;
            return (
              <View key={d.date} style={[styles.day, { backgroundColor: bg }]}>
                <Text style={[styles.dayLetter, { color: fg }]}>{weekdayLetter(d.date)}</Text>
                <Text style={[styles.dayValue, { color: fg }]}>
                  {got
                    ? `+${formatNaira(d.topupKobo, { compact: true })}`
                    : showToday
                      ? 'Today'
                      : ''}
                  {!got && !showToday && !isToday ? '—' : ''}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.note} color="sub">
          The top-up is for when you&apos;re running low: it&apos;s there any day your balance is
          under {formatNaira(w?.topup.thresholdKobo ?? 0)}. Dyce Cash is virtual: it can&apos;t be
          bought or withdrawn.
        </Text>

        {claim.isError ? (
          <Text color="accent" accessibilityLiveRegion="polite">
            {authErrorMessage(claim.error)}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={done ? 'Claimed' : `Claim ${amount}`}
          accessibilityState={{ disabled: !ready || claim.isPending }}
          disabled={!ready || claim.isPending}
          onPress={() => claim.mutate()}
          style={[
            styles.cta,
            { backgroundColor: done ? '#0E7C47' : ready ? '#C93E1C' : colors.chip },
          ]}
        >
          <Text style={[styles.ctaText, { color: ready || done ? '#FFFFFF' : colors.sub }]}>
            {claim.isPending
              ? 'Claiming…'
              : done
                ? 'Claimed'
                : ready
                  ? `Claim ${amount}`
                  : 'Not available'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 30, gap: 10 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  backText: { fontSize: 17, fontFamily: 'Figtree_500Medium' },
  hero: { height: 240, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  circle: { position: 'absolute', borderRadius: 999 },
  circleA: {
    left: -30,
    top: -30,
    width: 140,
    height: 140,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  circleB: {
    right: -40,
    bottom: -50,
    width: 180,
    height: 180,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  kicker: {
    color: '#FFFFFF',
    fontSize: 13,
    letterSpacing: 0.5,
    opacity: 0.9,
    fontFamily: 'Figtree_800ExtraBold',
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 64,
    letterSpacing: -2,
    fontFamily: 'BricolageGrotesque_800ExtraBold',
  },
  heroLine: {
    color: '#FFFFFF',
    fontSize: 15,
    opacity: 0.92,
    fontFamily: 'Figtree_500Medium',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  panel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    padding: 14,
    borderRadius: 18,
  },
  right: { alignItems: 'flex-end' },
  panelLabel: { fontSize: 12, fontFamily: 'Figtree_600SemiBold' },
  panelValue: { fontSize: 20, fontFamily: 'Figtree_800ExtraBold' },
  weekTitle: { fontSize: 13, fontFamily: 'Figtree_700Bold', marginTop: 8 },
  week: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    height: 64,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayLetter: { fontSize: 11, fontFamily: 'Figtree_700Bold' },
  dayValue: { fontSize: 13, fontFamily: 'Figtree_800ExtraBold' },
  note: { fontSize: 13, lineHeight: 20, marginTop: 6, fontFamily: 'Figtree_500Medium' },
  cta: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ctaText: { fontSize: 17, fontFamily: 'Figtree_800ExtraBold' },
});
