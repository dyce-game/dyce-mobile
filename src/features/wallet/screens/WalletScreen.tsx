import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira, type HistoryFilter } from '@dyce/shared';
import { Chip, Text, TokenButton, useTheme } from '@dyce/ui';
import { PillButton } from '@/components/PillButton';
import { authErrorMessage } from '@/features/auth/messages';
import { clockTime } from '@/features/chat/chat-logic';
import { TabHeader } from '@/features/shell/TabHeader';
import { groupByDay, historyTitle } from '../wallet-logic';
import { useClaimTopup, useHistoryQuery, useWalletQuery } from '../use-wallet';

const FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Sent' },
  { key: 'received', label: 'Received' },
  { key: 'requests', label: 'Requests' },
  { key: 'topups', label: 'Top-ups' },
  { key: 'games', label: 'Games' },
];

/**
 * The Wallet tab (design: Wallet). Dyce Cash is virtual: the card says so, and nothing here buys, withdraws or
 * exchanges it. Send, Request and Pay-a-code start here; history is filterable and each row opens a receipt.
 */
export function WalletScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const wallet = useWalletQuery();
  const history = useHistoryQuery(filter);
  const topup = useClaimTopup();

  const go = (href: string) => router.push(href as Href);
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];
  const groups = groupByDay(items);
  const w = wallet.data;

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
          right={
            w?.topup.available ? (
              <PillButton
                label={`Daily top-up ${formatNaira(w.topup.amountKobo, { compact: true })}`}
                tone="primary"
                busy={topup.isPending}
                onPress={() => topup.mutate()}
              />
            ) : undefined
          }
        />

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text variant="caption" color="sub">
            Dyce Cash
          </Text>
          {wallet.isLoading ? (
            <Text variant="display" color="sub">
              …
            </Text>
          ) : (
            <Text
              variant="display"
              accessibilityLabel={`Balance ${formatNaira(w?.balanceKobo ?? 0)}`}
            >
              {formatNaira(w?.balanceKobo ?? 0)}
            </Text>
          )}
          <Text variant="footnote" color="sub">
            Virtual cash. It can&apos;t be bought or withdrawn.
          </Text>
          {topup.isError ? (
            <Text variant="footnote" color="accent" accessibilityLiveRegion="polite">
              {authErrorMessage(topup.error)}
            </Text>
          ) : null}
          {wallet.isError ? (
            <View style={styles.retry}>
              <Text variant="footnote" color="accent">
                {authErrorMessage(wallet.error)}
              </Text>
              <TokenButton label="Try again" tone="chip" onPress={() => void wallet.refetch()} />
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <PillButton label="Send" tone="primary" onPress={() => go('/wallet/send')} />
          <PillButton label="Request" onPress={() => go('/wallet/request')} />
          <PillButton label="Pay a code" onPress={() => go('/wallet/scan')} />
        </View>

        <Text variant="headline" accessibilityRole="header">
          History
        </Text>
        <View style={styles.chips}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              selected={filter === f.key}
              onPress={() => setFilter(f.key)}
            />
          ))}
        </View>

        {history.isLoading ? <Text color="sub">Loading…</Text> : null}
        {history.isError ? (
          <View style={styles.retry}>
            <Text color="accent">{authErrorMessage(history.error)}</Text>
            <TokenButton label="Try again" tone="chip" onPress={() => void history.refetch()} />
          </View>
        ) : null}
        {history.isSuccess && items.length === 0 ? (
          <Text color="sub">Nothing here yet. Send some Dyce Cash to a friend to get going.</Text>
        ) : null}

        {groups.map((g) => (
          <View key={g.label} style={styles.group}>
            <Text variant="caption" color="sub" accessibilityRole="header">
              {g.label}
            </Text>
            {g.items.map((item) => {
              const title = historyTitle(item);
              const amount = formatNaira(Math.abs(item.amountKobo));
              const incoming = item.amountKobo > 0;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${title}, ${incoming ? 'received' : 'sent'} ${amount}, ${clockTime(item.createdAt)}`}
                  onPress={() => go(`/wallet/receipt/${item.id}`)}
                  style={[styles.row, { borderColor: colors.line }]}
                >
                  <View style={styles.rowBody}>
                    <Text variant="callout" numberOfLines={1}>
                      {title}
                    </Text>
                    <Text variant="footnote" color="sub" numberOfLines={1}>
                      {[item.note, clockTime(item.createdAt)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text variant="callout" color={incoming ? 'money' : 'text'}>
                    {incoming ? '+' : '−'}
                    {formatNaira(Math.abs(item.amountKobo), { compact: true })}
                  </Text>
                </Pressable>
              );
            })}
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
  content: { paddingHorizontal: 20, paddingBottom: 140, gap: 14 },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 4 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  group: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderBottomWidth: 1 },
  rowBody: { flex: 1, minWidth: 0 },
  retry: { gap: 8, marginTop: 8 },
});
