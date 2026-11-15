import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira, type HistoryFilter } from '@dyce/shared';
import { Icon, Text, TokenButton, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { ActivityRow } from '../components/ActivityRow';
import { groupByDay, HISTORY_CHIPS, weekBars } from '../wallet-logic';
import { useHistoryQuery, useWeeklyQuery } from '../use-wallet';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const BAR_PLUS = '#2BB673';

/**
 * History (design: WalletHistory): this week's net with a bar per day, the All / Pools / Transfers / Bonuses &
 * refunds chips, and every transaction grouped by day. Each row opens its receipt.
 */
export function HistoryScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const history = useHistoryQuery(filter);
  const week = useWeeklyQuery();

  const items = history.data?.pages.flatMap((p) => p.items) ?? [];
  const groups = groupByDay(items);
  const bars = weekBars(week.data?.days ?? []);
  const net = week.data?.netKobo ?? 0;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Wallet"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/wallet' as Href))}
            style={styles.back}
          >
            <Icon name="back" color={colors.accent} />
            <Text style={[styles.backText, { color: colors.accent }]}>Wallet</Text>
          </Pressable>
          <Text variant="footnote" color="sub">
            {MONTHS[new Date().getMonth()]}
          </Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          History
        </Text>

        <View style={[styles.net, { backgroundColor: colors.bg2 }]}>
          <View style={styles.netTop}>
            <Text variant="footnote" color="sub">
              This week, net
            </Text>
            <Text style={styles.netAmount} color={net >= 0 ? 'money' : 'text'}>
              {net >= 0 ? '+' : '−'}
              {formatNaira(Math.abs(net), { compact: true })}
            </Text>
          </View>
          <View
            style={styles.bars}
            accessibilityRole="image"
            accessibilityLabel="Daily net for the week"
          >
            {bars.map((b, i) => (
              <View key={i} style={styles.barCol}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${b.pct}%`,
                      backgroundColor: b.loss ? (isDark ? '#7A2A36' : '#F4A9B4') : BAR_PLUS,
                    },
                  ]}
                />
                <Text style={styles.barLetter} color="sub">
                  {b.letter}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.chips} accessibilityRole="tablist">
          {HISTORY_CHIPS.map((c) => {
            const on = filter === c.key;
            return (
              <Pressable
                key={c.key}
                accessibilityRole="button"
                accessibilityLabel={c.label}
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(c.key)}
                style={[styles.chip, { backgroundColor: on ? colors.ink : colors.chip }]}
              >
                <Text style={[styles.chipText, { color: on ? colors.inkText : colors.text }]}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {history.isLoading ? <Text color="sub">Loading…</Text> : null}
        {history.isError ? (
          <View style={styles.retry}>
            <Text color="accent">{authErrorMessage(history.error)}</Text>
            <TokenButton label="Try again" tone="chip" onPress={() => void history.refetch()} />
          </View>
        ) : null}
        {history.isSuccess && items.length === 0 ? (
          <Text color="sub">Nothing here yet.</Text>
        ) : null}

        {groups.map((g) => (
          <View key={g.label}>
            <Text style={styles.group} color="sub" accessibilityRole="header">
              {g.label}
            </Text>
            {g.items.map((item) => (
              <ActivityRow
                key={item.id}
                item={item}
                size="history"
                onPress={() => router.push(`/wallet/receipt/${item.id}` as Href)}
              />
            ))}
          </View>
        ))}

        {history.hasNextPage ? (
          <TokenButton
            label={history.isFetchingNextPage ? 'Loading…' : 'Load more'}
            tone="chip"
            disabled={history.isFetchingNextPage}
            onPress={() => void history.fetchNextPage()}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 6 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  backText: { fontSize: 17, fontFamily: 'Figtree_500Medium' },
  title: {
    fontSize: 32,
    letterSpacing: -0.6,
    marginBottom: 6,
    fontFamily: 'BricolageGrotesque_700Bold',
  },
  net: { borderRadius: 18, padding: 14 },
  netTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  netAmount: { fontSize: 20, fontFamily: 'Figtree_800ExtraBold' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 70, marginTop: 10 },
  barCol: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '100%', borderRadius: 6 },
  barLetter: { fontSize: 10, fontFamily: 'Figtree_700Bold' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', paddingTop: 12, paddingBottom: 4 },
  chip: {
    height: 34,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 17,
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, fontFamily: 'Figtree_600SemiBold' },
  group: { fontSize: 12, fontFamily: 'Figtree_700Bold', paddingTop: 12, paddingBottom: 2 },
  retry: { gap: 8 },
});
