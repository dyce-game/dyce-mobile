import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { formatNaira } from '@dyce/shared';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { Gradient } from '@/components/Gradient';
import { authErrorMessage } from '@/features/auth/messages';
import { clockTime, dayLabel } from '@/features/chat/chat-logic';
import { TabHeader } from '@/features/shell/TabHeader';
import { ActivityRow } from '../components/ActivityRow';
import { useHistoryQuery, useWalletQuery } from '../use-wallet';

const BALANCE_STOPS = [
  [0, '#F07A4A'],
  [0.4, '#C93E1C'],
  [1, '#8A2410'],
] as const;

/** "today", "yesterday" or "Nov 13": the quiet part of an activity line. */
function whenLabel(iso: string): string {
  const d = dayLabel(iso);
  return d === 'Today' || d === 'Yesterday' ? d.toLowerCase() : d;
}

/**
 * The Wallet tab (design: Wallet). An ember balance card that says the cash is virtual, Send / Request /
 * History, three small stats, the daily top-up banner when you can claim it, and recent activity. Dyce Cash
 * can't be bought or withdrawn; nothing here lets you do either.
 */
export function WalletScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const wallet = useWalletQuery();
  const history = useHistoryQuery('all');
  const go = (href: string) => router.push(href as Href);

  const w = wallet.data;
  const recent = (history.data?.pages[0]?.items ?? []).slice(0, 5);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={wallet.isRefetching || history.isRefetching}
            onRefresh={() => {
              void wallet.refetch();
              void history.refetch();
            }}
          />
        }
      >
        <TabHeader
          title="Wallet"
          compact
          right={
            w?.topup.available ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Daily top-up"
                onPress={() => go('/wallet/topup')}
                style={[styles.topup, { backgroundColor: colors.chip }]}
              >
                <Text variant="callout" style={styles.topupText}>
                  Daily top-up
                </Text>
              </Pressable>
            ) : undefined
          }
        />

        <Gradient
          stops={BALANCE_STOPS}
          radial={{ cx: 0.85, cy: 0.1 }}
          radius={26}
          style={styles.card}
        >
          <View style={styles.cardCorner} aria-hidden />
          <Text style={styles.cardLabel}>Dyce Cash</Text>
          <Text
            style={styles.balance}
            accessibilityLabel={`Balance ${formatNaira(w?.balanceKobo ?? 0)}`}
          >
            {wallet.isLoading ? '…' : formatNaira(w?.balanceKobo ?? 0, { compact: true })}
          </Text>
          <Text style={styles.cardSub}>Virtual cash for play · not withdrawable</Text>
          {w && w.locked.pools > 0 ? (
            <View style={styles.locked}>
              <Svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth={2.8}
                strokeLinecap="round"
              >
                <Rect x={5} y={11} width={14} height={9} rx={2} />
                <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </Svg>
              <Text style={styles.lockedText}>
                {formatNaira(w.locked.kobo)} locked in {w.locked.pools} open{' '}
                {w.locked.pools === 1 ? 'pool' : 'pools'}
              </Text>
            </View>
          ) : null}
          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              onPress={() => go('/wallet/send')}
              style={[styles.cardButton, { backgroundColor: '#FFFFFF' }]}
            >
              <Text style={[styles.cardButtonText, { color: '#8A2410' }]}>Send</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Request"
              onPress={() => go('/wallet/request')}
              style={[styles.cardButton, styles.cardButtonGlass]}
            >
              <Text style={styles.cardButtonText}>Request</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="History"
              onPress={() => go('/wallet/history')}
              style={[styles.cardButton, styles.cardButtonGlass]}
            >
              <Text style={styles.cardButtonText}>History</Text>
            </Pressable>
          </View>
        </Gradient>

        {wallet.isError ? (
          <View style={styles.retry}>
            <Text color="accent">{authErrorMessage(wallet.error)}</Text>
            <TokenButton label="Try again" tone="chip" onPress={() => void wallet.refetch()} />
          </View>
        ) : null}

        <View style={styles.stats}>
          <View style={[styles.stat, { backgroundColor: colors.bg2 }]}>
            <Text style={styles.statLabel} color="sub">
              Won this week
            </Text>
            <Text style={styles.statValue} color="money">
              {formatNaira(w?.stats.wonThisWeekKobo ?? 0, { compact: true })}
            </Text>
          </View>
          <View style={[styles.stat, { backgroundColor: colors.bg2 }]}>
            <Text style={styles.statLabel} color="sub">
              Win rate
            </Text>
            <Text style={styles.statValue}>
              {w?.stats.winRatePct == null ? '—' : `${w.stats.winRatePct}%`}
            </Text>
          </View>
          <View style={[styles.stat, { backgroundColor: colors.bg2 }]}>
            <Text style={styles.statLabel} color="sub">
              Streak
            </Text>
            <Text style={styles.statValue}>
              {w?.stats.winStreak ?? 0} {w?.stats.winStreak === 1 ? 'win' : 'wins'}
            </Text>
          </View>
        </View>

        {w?.topup.available ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Daily top-up is ready, plus ${formatNaira(w.topup.amountKobo)}`}
            onPress={() => go('/wallet/topup')}
            style={[styles.banner, { backgroundColor: colors.moneySoft }]}
          >
            <View style={styles.bannerBody}>
              <Text variant="callout">Daily top-up is ready</Text>
              <Text variant="footnote" color="sub">
                You&apos;re under {formatNaira(w.topup.thresholdKobo)}, so it&apos;s on us
              </Text>
            </View>
            <Text style={styles.bannerAmount} color="money">
              +{formatNaira(w.topup.amountKobo)}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.activityHead}>
          <Text style={styles.activityTitle} accessibilityRole="header">
            Activity
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pay a code"
            onPress={() => go('/wallet/scan')}
            style={styles.link}
          >
            <Text variant="callout" color="accent">
              Pay a code
            </Text>
          </Pressable>
        </View>
        {history.isLoading ? <Text color="sub">Loading…</Text> : null}
        {history.isSuccess && recent.length === 0 ? (
          <Text color="sub">Nothing here yet. Send some Dyce Cash to a friend to get going.</Text>
        ) : null}
        {recent.map((item) => (
          <ActivityRow
            key={item.id}
            item={item}
            meta={[item.note, `${whenLabel(item.createdAt)} ${clockTime(item.createdAt)}`]
              .filter(Boolean)
              .join(' · ')}
            onPress={() => go(`/wallet/receipt/${item.id}`)}
          />
        ))}
        {history.data && (history.data.pages[0]?.items.length ?? 0) > 5 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See all activity"
            onPress={() => go('/wallet/history')}
            style={styles.link}
          >
            <Text variant="callout" color="accent">
              See all activity
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 140, gap: 12 },
  topup: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  topupText: { fontSize: 14, fontFamily: 'Figtree_800ExtraBold' },
  card: { padding: 20 },
  cardCorner: {
    position: 'absolute',
    right: -18,
    top: -18,
    width: 110,
    height: 110,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    transform: [{ rotate: '18deg' }],
  },
  cardLabel: { color: '#FFFFFF', fontSize: 14, opacity: 0.9, fontFamily: 'Figtree_600SemiBold' },
  balance: {
    color: '#FFFFFF',
    fontSize: 44,
    letterSpacing: -1,
    marginTop: 2,
    fontFamily: 'BricolageGrotesque_800ExtraBold',
  },
  cardSub: {
    color: '#FFFFFF',
    fontSize: 13,
    opacity: 0.9,
    marginTop: 2,
    fontFamily: 'Figtree_500Medium',
  },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  lockedText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Figtree_700Bold' },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 18 },
  cardButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardButtonGlass: { backgroundColor: 'rgba(255,255,255,0.18)' },
  cardButtonText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Figtree_700Bold' },
  retry: { gap: 8 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 2 },
  stat: { flex: 1, borderRadius: 16, padding: 12 },
  statLabel: { fontSize: 12, fontFamily: 'Figtree_600SemiBold' },
  statValue: { fontSize: 18, marginTop: 4, fontFamily: 'Figtree_800ExtraBold' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    minHeight: 44,
  },
  bannerBody: { flex: 1 },
  bannerAmount: { fontSize: 16, fontFamily: 'Figtree_800ExtraBold' },
  activityHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  activityTitle: { fontSize: 17, fontFamily: 'Figtree_700Bold' },
  link: { minHeight: 44, justifyContent: 'center' },
});
