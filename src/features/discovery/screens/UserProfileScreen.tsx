import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, type UserProfile } from '@dyce/shared';
import { Icon, Text, brand, useTheme } from '@dyce/ui';
import { PillButton } from '@/components/PillButton';
import { authErrorMessage } from '@/features/auth/messages';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { useOpenDirect } from '@/features/chat/use-chat';
import { contactsApi } from '@/lib/api';
import { useAcceptRequest } from '@/features/friends/use-friends';
import { useBlockUser } from '@/features/safety/use-safety';
import {
  headToHeadLast,
  headToHeadShare,
  mutualLabel,
  profileAction,
  resultLabel,
  winRateLabel,
} from '../discovery-logic';
import { useUserProfileQuery } from '../use-discovery';

/**
 * Someone's profile (design: UserProfile). A stranger is marked "Not in your contacts" and shows mutual friends;
 * head to head and stats come from real finished games; recent games only for friends. Message, add friend,
 * Challenge (friends), Report and Block. Blocked people (either way) look like they don't exist.
 */
export function UserProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { username } = useLocalSearchParams<{ username: string }>();
  const q = useUserProfileQuery(username);
  const client = useQueryClient();
  const open = useOpenDirect();
  const accept = useAcceptRequest();
  const block = useBlockUser();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const back = () => (router.canGoBack() ? router.back() : router.replace('/chat' as Href));
  const p = q.data;

  const refresh = () => {
    void client.invalidateQueries({ queryKey: queryKeys.profile(username ?? '') });
    void client.invalidateQueries({ queryKey: queryKeys.friendRequests });
  };

  async function addFriend(profile: UserProfile) {
    setBusy(true);
    setError(undefined);
    try {
      await contactsApi.addFriend(profile.id);
      refresh();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function message(profile: UserProfile, thenGames: boolean) {
    setError(undefined);
    open.mutate(profile.id, {
      onSuccess: (conv) => {
        router.push(`/c/${conv.id}` as Href);
        if (thenGames) router.push(`/games?conversationId=${conv.id}` as Href);
      },
      onError: (err) => setError(authErrorMessage(err)),
    });
  }

  function reportIt(profile: UserProfile) {
    setMenu(false);
    router.push({
      pathname: '/report',
      params: {
        userId: profile.id,
        username: profile.username,
        name: profile.displayName,
      },
    } as Href);
  }

  function blockIt(profile: UserProfile) {
    setMenu(false);
    block.mutate(profile.id, {
      onSuccess: back,
      onError: (err) => setError(authErrorMessage(err)),
    });
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={back}
          style={styles.iconBtn}
        >
          <Icon name="back" size={24} color={colors.accent} strokeWidth={2.4} />
        </Pressable>
        {p && p.relationship !== 'self' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More options"
            accessibilityState={{ expanded: menu }}
            onPress={() => setMenu((v) => !v)}
            style={styles.iconBtn}
          >
            <Icon name="menu" size={22} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      {q.isLoading ? (
        <ActivityIndicator style={styles.loading} color={colors.accent} />
      ) : q.isError || !p ? (
        <View style={styles.missing}>
          <Text style={styles.name} accessibilityRole="header">
            Can&apos;t find that person
          </Text>
          <Text color="sub" style={styles.center}>
            {q.error ? authErrorMessage(q.error) : 'They may have changed their username.'}
          </Text>
          <PillButton label="Go back" onPress={back} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.who}>
            <UserAvatar avatar={p.avatar} name={p.displayName || p.username} size={96} />
            <View style={styles.whoText}>
              <Text style={styles.name} accessibilityRole="header" numberOfLines={1}>
                @{p.username}
              </Text>
              <Text color="sub" style={styles.sub} numberOfLines={1}>
                {p.displayName && p.displayName !== p.username ? `${p.displayName} · ` : ''}Level{' '}
                {p.level}
              </Text>
              {p.relationship === 'self' ? null : p.inContacts ? (
                <View style={[styles.pill, { backgroundColor: colors.moneySoft }]}>
                  <Text style={[styles.pillText, { color: colors.money }]}>
                    {p.relationship === 'friends' ? 'Friend' : 'In your contacts'}
                  </Text>
                </View>
              ) : (
                <View style={[styles.pill, { backgroundColor: colors.brandSoft }]}>
                  <Text style={[styles.pillText, { color: colors.accent }]}>
                    Not in your contacts
                  </Text>
                </View>
              )}
            </View>
          </View>

          {mutualLabel(p.mutualFriends) ? (
            <Text color="sub" style={styles.mutual}>
              {mutualLabel(p.mutualFriends)}
            </Text>
          ) : null}

          {p.headToHead ? (
            <View
              style={[styles.card, { backgroundColor: colors.bg2 }]}
              accessible
              accessibilityLabel={`Head to head. You ${p.headToHead.wins}, them ${p.headToHead.losses}, draws ${p.headToHead.draws}`}
            >
              <Text style={styles.cardLabel} color="sub">
                Head to head
              </Text>
              <View style={styles.h2h}>
                <View style={styles.h2hSide}>
                  <Text style={styles.h2hNum}>{p.headToHead.wins}</Text>
                  <Text color="sub" style={styles.statLabel}>
                    You
                  </Text>
                </View>
                <View style={[styles.bar, { backgroundColor: colors.chip }]}>
                  <View
                    style={{
                      width: `${headToHeadShare(p.headToHead)}%`,
                      backgroundColor: brand.ember.fill,
                    }}
                  />
                </View>
                <View style={styles.h2hSide}>
                  <Text style={styles.h2hNum}>{p.headToHead.losses}</Text>
                  <Text color="sub" style={styles.statLabel}>
                    Them
                  </Text>
                </View>
              </View>
              <Text color="sub" style={styles.center}>
                {headToHeadLast(p.headToHead) ?? 'You have not played each other yet.'}
              </Text>
            </View>
          ) : null}

          <View style={styles.stats}>
            <Stat label="games" value={String(p.stats.games)} />
            <Stat label="wins" value={winRateLabel(p.stats.winRate)} />
            <Stat label="win streak" value={`${p.stats.streak}`} />
          </View>

          {p.playsMost.length > 0 ? (
            <>
              <Text style={styles.section} accessibilityRole="header">
                Plays most
              </Text>
              <View style={styles.chips}>
                {p.playsMost.map((g) => (
                  <View
                    key={g.gameSlug}
                    style={[styles.chip, { backgroundColor: colors.ink }]}
                    accessible
                    accessibilityLabel={`${g.gameName}, ${g.wins} wins`}
                  >
                    <Text style={[styles.chipText, { color: colors.inkText }]}>
                      {g.gameName} · {g.wins} W
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {p.badges.length > 0 ? (
            <>
              <Text style={styles.section} accessibilityRole="header">
                Badges
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.badges}
              >
                {p.badges.map((b) => (
                  <View key={b.slug} style={styles.badge} accessible accessibilityLabel={b.name}>
                    <View style={[styles.badgeTile, { backgroundColor: b.color }]}>
                      <Text style={styles.badgeMark}>{b.mark}</Text>
                    </View>
                    <Text style={styles.badgeName}>{b.name}</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}

          {p.recentGames ? (
            <>
              <Text style={styles.section} accessibilityRole="header">
                Recent games
              </Text>
              {p.recentGames.length === 0 ? (
                <Text color="sub" style={styles.empty}>
                  No finished games yet.
                </Text>
              ) : (
                p.recentGames.map((g) => (
                  <View
                    key={g.matchId}
                    style={[styles.game, { borderColor: colors.line }]}
                    accessible
                    accessibilityLabel={`${g.gameName}, ${resultLabel(g.result)}, ${g.mode === 'pool' ? 'Pool' : 'Free'}`}
                  >
                    <View style={styles.gameBody}>
                      <Text style={styles.gameName}>{g.gameName}</Text>
                      <Text color="sub" style={styles.statLabel}>
                        {g.isSpace ? 'Space' : g.against ? `vs @${g.against}` : ''} ·{' '}
                        {g.mode === 'pool' ? 'Pool' : 'Free'}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.gameResult,
                        { color: g.result === 'win' ? colors.money : colors.sub },
                      ]}
                    >
                      {resultLabel(g.result)}
                    </Text>
                  </View>
                ))
              )}
            </>
          ) : null}

          {error ? (
            <Text color="accent" style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </ScrollView>
      )}

      {p && p.relationship !== 'self' ? (
        <View style={styles.actions}>
          <View style={styles.actionRow}>
            <PillButton
              label="Message"
              tone="primary"
              busy={open.isPending}
              accessibilityLabel={`Message @${p.username}`}
              onPress={() => message(p, false)}
            />
            {p.relationship === 'friends' ? (
              <PillButton
                label="Challenge"
                accessibilityLabel={`Challenge @${p.username} to a game`}
                onPress={() => message(p, true)}
              />
            ) : null}
            <FriendButton
              profile={p}
              busy={busy || accept.isPending}
              onAdd={() => void addFriend(p)}
              onAccept={() => accept.mutate(p.id, { onSuccess: refresh })}
            />
          </View>
        </View>
      ) : null}

      {menu && p ? (
        <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Report @${p.username}`}
            onPress={() => reportIt(p)}
            style={[styles.menuRow, { borderColor: colors.line }]}
          >
            <Text style={styles.menuText}>Report</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Block @${p.username}`}
            onPress={() => blockIt(p)}
            style={styles.menuRow}
          >
            <Text style={[styles.menuText, { color: colors.danger }]}>Block @{p.username}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function FriendButton({
  profile,
  busy,
  onAdd,
  onAccept,
}: {
  profile: UserProfile;
  busy: boolean;
  onAdd: () => void;
  onAccept: () => void;
}) {
  const action = profileAction(profile.relationship, profile.canRequest);
  switch (action.kind) {
    case 'add':
      return (
        <PillButton
          label="Add friend"
          busy={busy}
          accessibilityLabel={`Add @${profile.username} as a friend`}
          onPress={onAdd}
        />
      );
    case 'accept':
      return (
        <PillButton
          label="Accept"
          tone="primary"
          busy={busy}
          accessibilityLabel={`Accept @${profile.username}'s friend request`}
          onPress={onAccept}
        />
      );
    case 'requested':
      return <PillButton label="Requested" disabled onPress={() => undefined} />;
    case 'closed':
      return <PillButton label="Not taking requests" disabled onPress={() => undefined} />;
    default:
      return null;
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.stat, { backgroundColor: colors.bg2 }]}
      accessible
      accessibilityLabel={`${label}, ${value}`}
    >
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} color="sub">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    minHeight: 44,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  loading: { marginTop: 60 },
  missing: { alignItems: 'center', gap: 12, paddingHorizontal: 32, paddingTop: 60 },
  center: { textAlign: 'center', fontSize: 13 },
  content: { paddingBottom: 24 },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  whoText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 24, fontFamily: 'BricolageGrotesque_800ExtraBold' },
  sub: { fontSize: 13, fontFamily: 'Figtree_500Medium' },
  pill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: { fontSize: 12, fontFamily: 'Figtree_700Bold' },
  mutual: { fontSize: 13, paddingHorizontal: 16, paddingTop: 10 },
  card: { marginHorizontal: 16, marginTop: 16, borderRadius: 22, padding: 16, gap: 6 },
  cardLabel: { fontSize: 13, fontFamily: 'Figtree_700Bold' },
  h2h: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  h2hSide: { alignItems: 'center', width: 70 },
  h2hNum: { fontSize: 32, fontFamily: 'Figtree_800ExtraBold' },
  bar: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' },
  stats: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 10 },
  stat: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statValue: { fontSize: 17, fontFamily: 'Figtree_800ExtraBold' },
  statLabel: { fontSize: 12, fontFamily: 'Figtree_500Medium' },
  section: {
    fontSize: 17,
    fontFamily: 'Figtree_700Bold',
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center' },
  chipText: { fontSize: 13, fontFamily: 'Figtree_700Bold' },
  badges: { gap: 10, paddingHorizontal: 16 },
  badge: { width: 64, alignItems: 'center', gap: 4 },
  badgeTile: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  badgeMark: { color: '#FFFFFF', fontSize: 18, fontFamily: 'Figtree_800ExtraBold' },
  badgeName: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 13,
    fontFamily: 'Figtree_600SemiBold',
  },
  empty: { fontSize: 13, paddingHorizontal: 16 },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    minHeight: 52,
    borderBottomWidth: 1,
    gap: 12,
  },
  gameBody: { flex: 1 },
  gameName: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  gameResult: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
  error: { paddingHorizontal: 16, paddingTop: 12, fontSize: 13 },
  actions: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  menu: {
    position: 'absolute',
    right: 12,
    top: 96,
    width: 220,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderColor: 'transparent',
  },
  menuText: { fontSize: 15, fontFamily: 'Figtree_500Medium' },
});
