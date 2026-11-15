import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text, brand, useTheme } from '@dyce/ui';
import { useMeQuery } from '@/features/avatar/use-avatar';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { useFriendRequestsQuery, useFriendsQuery } from '@/features/friends/use-friends';
import { friendsLabel, levelLabel } from '../profile-logic';

/**
 * My profile (design: Profile): avatar with an edit button, name, @username, friends and level, and links to
 * Friends and Settings. The design's stat cards, badges, Notifications card and Share button wait for games,
 * the badge system, push and invite links; nothing here is a dead control.
 */
export function ProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const me = useMeQuery();
  const friends = useFriendsQuery();
  const waiting = useFriendRequestsQuery().data?.incoming.length ?? 0;
  const profile = me.data?.profile;
  const name = profile?.displayName || profile?.username || 'You';
  const count = friends.data?.friends.length ?? 0;
  const go = (href: string) => router.push(href as Href);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/chat' as Href));

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={back}
          style={styles.iconBtn}
        >
          <Icon name="back" size={24} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => go('/settings')}
          style={styles.iconBtn}
        >
          <Icon name="gear" size={22} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.who}>
          <View>
            <UserAvatar avatar={profile?.avatar} name={name} size={120} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit avatar"
              onPress={() => go('/avatar')}
              style={[styles.pencil, { borderColor: colors.bg }]}
            >
              <Icon name="edit" size={16} color={brand.ember.text} strokeWidth={2.4} />
            </Pressable>
          </View>
          <Text style={styles.name} accessibilityRole="header">
            {name}
          </Text>
          {profile ? (
            <>
              <Text color="sub" style={styles.handle}>
                @{profile.username}
              </Text>
              <Text color="sub" style={styles.level}>
                {levelLabel(profile.level, profile.xp)}
              </Text>
            </>
          ) : (
            <Text color="sub" style={styles.handle}>
              {me.isError ? "Can't load your profile." : ' '}
            </Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            waiting > 0
              ? `Friends, ${friendsLabel(count)}, ${waiting} ${waiting === 1 ? 'request' : 'requests'} waiting`
              : `Friends, ${friendsLabel(count)}`
          }
          onPress={() => go('/friends')}
          style={[styles.card, { backgroundColor: colors.bg2 }]}
        >
          <View
            style={[
              styles.tile,
              { backgroundColor: brand.ember.fill, boxShadow: `0px 2px 0px ${brand.ember.edge}` },
            ]}
            aria-hidden
          >
            <Icon name="friends" size={18} color={brand.ember.text} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Friends</Text>
            <Text style={styles.cardSub} color="sub">
              {waiting > 0 ? `${friendsLabel(count)} · ${waiting} waiting` : friendsLabel(count)}
            </Text>
          </View>
          {waiting > 0 ? (
            <View style={styles.count} aria-hidden>
              <Text style={styles.countText}>{waiting > 99 ? '99+' : waiting}</Text>
            </View>
          ) : null}
        </Pressable>

        <View style={[styles.list, { backgroundColor: colors.bg2 }]}>
          <Row label="Edit profile" onPress={() => go('/profile/edit')} />
          <Row label="Settings" onPress={() => go('/settings')} last />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, onPress, last }: { label: string; onPress: () => void; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.row, { borderColor: colors.line, borderBottomWidth: last ? 0 : 1 }]}
    >
      <Text style={styles.rowText}>{label}</Text>
      <View style={styles.chevron}>
        <Icon name="back" size={16} color={colors.sub} />
      </View>
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
    paddingHorizontal: 12,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 40 },
  who: { alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 4 },
  pencil: {
    position: 'absolute',
    right: 0,
    bottom: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    backgroundColor: brand.ember.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 26, fontFamily: 'BricolageGrotesque_800ExtraBold', marginTop: 2 },
  handle: { fontSize: 14, fontFamily: 'Figtree_500Medium' },
  level: { fontSize: 13, fontFamily: 'Figtree_700Bold' },
  card: {
    marginHorizontal: 16,
    marginTop: 18,
    minHeight: 64,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tile: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontFamily: 'Figtree_700Bold' },
  cardSub: { fontSize: 12, fontFamily: 'Figtree_500Medium' },
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: brand.ember.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Figtree_800ExtraBold' },
  list: { marginHorizontal: 16, marginTop: 10, borderRadius: 18, overflow: 'hidden' },
  row: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  chevron: { transform: [{ rotate: '180deg' }] },
});
