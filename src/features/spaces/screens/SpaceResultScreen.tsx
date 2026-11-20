import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira, queryKeys, type SpaceMember, type SpaceView } from '@dyce/shared';
import { Text } from '@dyce/ui';
import { useSession } from '@/features/auth/use-session';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { netKobo, ordinal, prizeText } from '../spaces-logic';
import { useSpaceQuery } from '../use-spaces';

const POOL_BG = '#B5381A';
const FREE_BG = '#13985A';

/** Placement blocks by rank for the podium (design: RoomResult): the winner tallest, in the middle. */
const BLOCK = [
  { h: 96, avatar: 74, color: '#B37A00' },
  { h: 70, avatar: 60, color: '#7C8597' },
  { h: 56, avatar: 56, color: '#A0582E' },
] as const;

/**
 * The result of a space (design: RoomResult): the podium, everyone's place and what they took home, and what it
 * meant for you. The same numbers the server paid: placements and payouts are read from the finished match.
 */
export function SpaceResultScreen({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const myId = useSession((s) => s.userId);
  const query = useSpaceQuery(spaceId);
  const space = query.data;

  useEffect(() => {
    void client.invalidateQueries({ queryKey: queryKeys.wallet });
  }, [client]);
  // The result is written by the game server a moment after the last card: look again until it is there.
  useEffect(() => {
    if (!space || space.status === 'ended') return;
    const id = setInterval(() => void query.refetch(), 1500);
    return () => clearInterval(id);
  }, [space, query]);

  const leave = () => router.replace('/spaces' as Href);

  if (!space || space.status !== 'ended') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: FREE_BG }, styles.center]}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.white}>Counting up…</Text>
      </SafeAreaView>
    );
  }

  const pool = space.mode === 'pool';
  const ranked = [...space.members].sort(
    (a, b) => (a.placement ?? 99) - (b.placement ?? 99) || a.seat - b.seat,
  );
  const me = ranked.find((m) => m.userId === myId);
  const winner = ranked[0];
  const podium = ranked.filter((m) => (m.placement ?? 99) <= 3).slice(0, 3);
  // 2nd, 1st, 3rd left to right, as on a podium
  const order = [podium[1], podium[0], podium[2]].filter((m): m is SpaceMember => !!m);
  const rest = ranked.filter((m) => !podium.includes(m));
  const nameOf = (m: SpaceMember) => (m.userId === myId ? 'You' : m.displayName || m.username);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: pool ? POOL_BG : FREE_BG }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text variant="caption" style={styles.white}>
              {space.gameName} · {pool ? `Pool ${formatNaira(space.potKobo)}` : 'Free space'}
            </Text>
          </View>
        </View>
        <Text style={[styles.white, styles.sub]}>{space.name}</Text>
        <Text style={[styles.white, styles.headline]} accessibilityRole="header">
          {winner
            ? `${winner.userId === myId ? 'You take' : `${nameOf(winner)} takes`} it`
            : 'Game over'}
        </Text>

        <View style={styles.podium}>
          {order.map((m) => {
            const rank = (m.placement ?? 3) as 1 | 2 | 3;
            const b = BLOCK[rank - 1] ?? BLOCK[2];
            return (
              <View
                key={m.userId}
                accessible
                accessibilityLabel={`${ordinal(rank)}, ${nameOf(m)}${prizeText(space, m) ? `, ${prizeText(space, m)}` : ''}`}
                style={styles.podiumCol}
              >
                <UserAvatar avatar={m.avatar} name={nameOf(m)} size={b.avatar} />
                <Text variant="callout" style={styles.white} numberOfLines={1}>
                  {nameOf(m)}
                </Text>
                {prizeText(space, m) ? (
                  <View style={styles.prize}>
                    <Text style={styles.prizeText}>{prizeText(space, m)}</Text>
                  </View>
                ) : null}
                <View style={[styles.block, { height: b.h, backgroundColor: b.color }]}>
                  <Text style={styles.rank}>{rank}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {rest.length > 0 ? (
          <View style={styles.rest}>
            {rest.map((m) => (
              <View key={m.userId} style={styles.restRow}>
                <Text style={[styles.white, styles.restRank]}>{m.placement ?? '–'}</Text>
                <Text style={[styles.white, styles.restName]}>{nameOf(m)}</Text>
                {m.result === 'forfeit' ? <Text style={styles.restNote}>left early</Text> : null}
                <Text style={[styles.white, styles.restPrize]}>{prizeText(space, m)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {me ? (
          <View style={styles.summary}>
            <Text style={styles.white}>{summary(space, me)}</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Spaces"
          onPress={leave}
          style={styles.done}
        >
          <Text style={styles.doneText}>Back to Spaces</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function summary(space: SpaceView, me: SpaceMember): string {
  const place = me.placement ?? space.members.length;
  if (space.mode !== 'pool') {
    return place === 1
      ? 'You won. Free space: no cash moved.'
      : `You finished ${ordinal(place)}. Free space: no cash moved.`;
  }
  const net = netKobo(me);
  const put = formatNaira(me.stakedKobo);
  if (me.result === 'forfeit') return `You left early and lost your ${put} seat fee.`;
  if (net > 0)
    return `You put in ${put} and took home ${formatNaira(me.payoutKobo ?? 0)}, net +${formatNaira(net)}. Paid out instantly.`;
  if (net === 0) return `You put in ${put} and got it back.`;
  return `You put in ${put} and finished ${ordinal(place)}, net −${formatNaira(-net)}.`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  scroll: { paddingBottom: 12 },
  white: { color: '#FFFFFF' },
  badgeRow: { alignItems: 'center', marginTop: 16 },
  badge: {
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sub: {
    textAlign: 'center',
    marginTop: 12,
    opacity: 0.85,
    fontFamily: 'Figtree_700Bold',
    fontSize: 14,
  },
  headline: {
    textAlign: 'center',
    fontSize: 34,
    letterSpacing: -0.6,
    fontFamily: 'BricolageGrotesque_800ExtraBold',
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  podiumCol: { width: 104, alignItems: 'center', gap: 6 },
  prize: {
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 10,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  prizeText: { color: '#0E7C47', fontSize: 13, fontFamily: 'Figtree_800ExtraBold' },
  block: {
    width: '100%',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    alignItems: 'center',
    paddingTop: 8,
  },
  rank: { color: '#fff', fontSize: 28, fontFamily: 'BricolageGrotesque_800ExtraBold' },
  rest: {
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.24)',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  restRank: { width: 18, fontFamily: 'Figtree_800ExtraBold', opacity: 0.7 },
  restName: { flex: 1, fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  restNote: { color: '#FFD9CF', fontSize: 12 },
  restPrize: { minWidth: 64, textAlign: 'right', fontSize: 13, fontFamily: 'Figtree_700Bold' },
  summary: { margin: 16, padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)' },
  footer: { padding: 16, gap: 10 },
  done: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  doneText: { color: '#fff', fontSize: 15, fontFamily: 'Figtree_700Bold' },
});
