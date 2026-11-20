import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LeaderboardMetric, LeaderboardRow, LeaderboardScope } from '@dyce/shared';
import { Icon, Segmented, Text, brand, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { useGamesQuery } from '@/features/games/use-games';
import { behindNote, boardValue, resetsIn } from '../discovery-logic';
import { useLeaderboardQuery } from '../use-discovery';

const SCOPES: { key: LeaderboardScope; label: string }[] = [
  { key: 'friends', label: 'Friends' },
  { key: 'global', label: 'Everyone' },
];
const BLOCKS = ['#B37A00', '#7C8597', '#A0582E'];

/**
 * Weekly leaderboard (design: Leaderboard): Friends or Everyone, optionally one game, ranked by XP (or net Pool
 * winnings among friends only, since that is money). Resets Monday 00:00 in Lagos. A podium for the top three, the
 * rest in a list, and your own row pinned at the bottom with how far you are from the next place.
 */
export function LeaderboardScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [scope, setScope] = useState<LeaderboardScope>('friends');
  const [metric, setMetric] = useState<LeaderboardMetric>('xp');
  const [game, setGame] = useState<string | undefined>();
  const games = useGamesQuery();
  const effectiveMetric: LeaderboardMetric = scope === 'global' ? 'xp' : metric;
  const board = useLeaderboardQuery({ scope, metric: effectiveMetric, game });
  const data = board.data;
  const rows = data?.rows ?? [];
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as Href));
  const open = (r: LeaderboardRow) => router.push(`/u/${r.username}` as Href);
  const note = data ? behindNote(effectiveMetric, data.me, data.above) : null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={back}
          style={styles.back}
        >
          <Icon name="back" size={24} color={colors.accent} strokeWidth={2.4} />
        </Pressable>
        <Text color="sub" style={styles.resets}>
          {data ? resetsIn(data.resetsAt, new Date()) : ' '}
        </Text>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        This week
      </Text>

      <View style={styles.pad}>
        <Segmented
          label="Who to rank"
          options={SCOPES}
          value={scope}
          onChange={(s) => {
            setScope(s);
            if (s === 'global') setMetric('xp');
          }}
        />
      </View>
      <View style={styles.chips}>
        <MetricChip label="XP" on={effectiveMetric === 'xp'} onPress={() => setMetric('xp')} />
        {scope === 'friends' ? (
          <MetricChip
            label="Pool · net winnings"
            on={effectiveMetric === 'pool'}
            onPress={() => setMetric('pool')}
          />
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.gameChips}
        style={styles.gameScroll}
      >
        <MetricChip label="All games" on={!game} onPress={() => setGame(undefined)} />
        {(games.data?.games ?? []).map((g) => (
          <MetricChip
            key={g.slug}
            label={g.name}
            on={game === g.slug}
            onPress={() => setGame(g.slug)}
          />
        ))}
      </ScrollView>

      {board.isLoading ? (
        <ActivityIndicator style={styles.loading} color={colors.accent} />
      ) : board.isError ? (
        <Text color="accent" style={styles.center} accessibilityLiveRegion="polite">
          {authErrorMessage(board.error)}
        </Text>
      ) : rows.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle} accessibilityRole="header">
            Nobody has scored yet
          </Text>
          <Text color="sub" style={styles.center}>
            Finish a game this week to get on the board.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.podium}>
            {[1, 0, 2].map((i) => {
              const r = podium[i];
              if (!r) return <View key={i} style={styles.podiumCol} />;
              return (
                <Pressable
                  key={r.userId}
                  accessibilityRole="button"
                  accessibilityLabel={`Rank ${r.rank}, ${r.isMe ? 'you' : r.displayName || r.username}, ${boardValue(effectiveMetric, r.value)}`}
                  onPress={() => open(r)}
                  style={styles.podiumCol}
                >
                  <UserAvatar
                    avatar={r.avatar}
                    name={r.displayName || r.username}
                    size={i === 0 ? 72 : 58}
                  />
                  <Text style={styles.podiumName} numberOfLines={1}>
                    {r.isMe ? 'You' : r.displayName || r.username}
                  </Text>
                  <Text
                    style={[
                      styles.podiumValue,
                      {
                        color:
                          effectiveMetric === 'pool' && r.value < 0 ? colors.sub : colors.money,
                      },
                    ]}
                  >
                    {boardValue(effectiveMetric, r.value)}
                  </Text>
                  <View
                    style={[styles.block, { height: [92, 64, 48][i]!, backgroundColor: BLOCKS[i] }]}
                  >
                    <Text style={styles.blockRank}>{r.rank}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.rest, { borderColor: colors.line }]}>
            {rest.map((r) => (
              <Pressable
                key={r.userId}
                accessibilityRole="button"
                accessibilityLabel={`Rank ${r.rank}, ${r.isMe ? 'you' : r.displayName || r.username}, ${boardValue(effectiveMetric, r.value)}`}
                onPress={() => open(r)}
                style={[styles.row, { borderColor: colors.line }]}
              >
                <Text style={[styles.rank, { color: colors.sub }]}>{r.rank}</Text>
                <UserAvatar avatar={r.avatar} name={r.displayName || r.username} size={38} />
                <Text style={styles.rowName} numberOfLines={1}>
                  {r.isMe ? 'You' : r.displayName || r.username}
                </Text>
                <Text style={styles.rowValue}>{boardValue(effectiveMetric, r.value)}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {data?.me ? (
        <View
          style={[styles.me, { backgroundColor: brand.ember.fill }]}
          accessible
          accessibilityLabel={`You are rank ${data.me.rank}, ${boardValue(effectiveMetric, data.me.value)}${note ? `. ${note}` : ''}`}
        >
          <Text style={styles.meRank}>{data.me.rank}</Text>
          <View style={styles.meBody}>
            <Text style={styles.meName}>You</Text>
            {note ? <Text style={styles.meNote}>{note}</Text> : null}
          </View>
          <Text style={styles.meValue}>{boardValue(effectiveMetric, data.me.value)}</Text>
        </View>
      ) : data && !board.isLoading ? (
        <Text color="sub" style={[styles.center, styles.pinned]}>
          You are not on this board yet.
        </Text>
      ) : null}
    </SafeAreaView>
  );
}

function MetricChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: on ? colors.brandSoft : colors.chip }]}
    >
      <Text style={[styles.chipText, { color: on ? colors.accent : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  resets: { fontSize: 13, fontFamily: 'Figtree_600SemiBold', paddingRight: 8 },
  title: {
    fontSize: 32,
    letterSpacing: -0.6,
    paddingHorizontal: 16,
    marginBottom: 10,
    fontFamily: 'BricolageGrotesque_700Bold',
  },
  pad: { paddingHorizontal: 16 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  gameScroll: { flexGrow: 0 },
  gameChips: { gap: 8, paddingHorizontal: 16, paddingTop: 6 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center' },
  chipText: { fontSize: 13, fontFamily: 'Figtree_700Bold' },
  loading: { marginTop: 40 },
  center: { textAlign: 'center', fontSize: 14, paddingHorizontal: 24 },
  pinned: { paddingVertical: 16 },
  emptyBox: { alignItems: 'center', paddingTop: 50, gap: 6 },
  emptyTitle: { fontSize: 20, fontFamily: 'BricolageGrotesque_700Bold' },
  list: { paddingBottom: 16 },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  podiumCol: { flex: 1, maxWidth: 112, alignItems: 'center', gap: 4, minHeight: 44 },
  podiumName: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
  podiumValue: { fontSize: 13, fontFamily: 'Figtree_800ExtraBold' },
  block: {
    width: '100%',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    alignItems: 'center',
    paddingTop: 4,
  },
  blockRank: { color: '#FFFFFF', fontSize: 28, fontFamily: 'BricolageGrotesque_800ExtraBold' },
  rest: { marginHorizontal: 16, borderTopWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, borderBottomWidth: 1 },
  rank: { width: 26, fontSize: 15, fontFamily: 'Figtree_800ExtraBold' },
  rowName: { flex: 1, fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  rowValue: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
  me: {
    marginHorizontal: 12,
    marginBottom: 16,
    minHeight: 62,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  meRank: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Figtree_800ExtraBold', minWidth: 26 },
  meBody: { flex: 1 },
  meName: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Figtree_700Bold' },
  meNote: { color: '#FFFFFF', fontSize: 12, opacity: 0.9 },
  meValue: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Figtree_800ExtraBold' },
});
