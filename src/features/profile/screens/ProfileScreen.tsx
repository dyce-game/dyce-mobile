import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text, brand, useTheme } from '@dyce/ui';
import { useMeQuery } from '@/features/avatar/use-avatar';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { useFriendsQuery } from '@/features/friends/use-friends';
import { BADGE_PREVIEW, friendsLabel, profileStats, xpLabel, xpProgress } from '../profile-logic';

/**
 * My profile (design: Profile): back, share, notifications and settings; the avatar with its edit button; name
 * and @username with your friend count; the level bar; a Notifications card; four stat cards; badges; recent
 * games. The design's sample numbers are real data where it exists (name, friends, level, XP) and an honest
 * "nothing yet" where it doesn't (no games, badges or notifications exist; no city is collected).
 */
export function ProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const me = useMeQuery();
  const friends = useFriendsQuery();
  const profile = me.data?.profile;
  const name = profile?.displayName || profile?.username || 'You';
  const count = friends.data?.friends.length ?? 0;
  const go = (href: string) => router.push(href as Href);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/chat' as Href));

  async function share() {
    if (!profile) return;
    try {
      // an invite link replaces this once links exist
      await Share.share({ message: `Play with me on Dyce: @${profile.username}` });
    } catch {
      // closing the share sheet, or a browser without sharing, is not an error worth showing
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <IconButton label="Back" icon="back" size={24} onPress={back} />
        <View style={styles.right}>
          <IconButton label="Share profile" icon="share" onPress={() => void share()} />
          <IconButton label="Notifications" icon="bell" onPress={() => go('/notifications')} />
          <IconButton label="Settings" icon="gear" onPress={() => go('/settings')} />
        </View>
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
            <Text color="sub" style={styles.handle}>
              @{profile.username} ·{' '}
              <Text
                accessibilityRole="link"
                accessibilityLabel={`${friendsLabel(count)}, open Friends`}
                onPress={() => go('/friends')}
                style={[styles.friendsLink, { color: colors.accent }]}
              >
                {friendsLabel(count)}
              </Text>
            </Text>
          ) : (
            <Text color="sub" style={styles.handle}>
              {me.isError ? "Can't load your profile." : ' '}
            </Text>
          )}

          {profile ? (
            <View style={styles.level}>
              <View style={styles.levelRow}>
                <Text style={styles.levelText}>Level {profile.level}</Text>
                <Text color="sub" style={styles.levelText}>
                  {xpLabel(profile.level, profile.xp)}
                </Text>
              </View>
              <View
                style={[styles.bar, { backgroundColor: colors.chip }]}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={`Level ${profile.level}, ${xpLabel(profile.level, profile.xp)}`}
              >
                <View
                  style={[
                    styles.fill,
                    { width: `${Math.round(xpProgress(profile.level, profile.xp) * 100)}%` },
                  ]}
                />
              </View>
            </View>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications, nothing new"
          onPress={() => go('/notifications')}
          style={[styles.notif, { backgroundColor: colors.bg2 }]}
        >
          <View
            style={[
              styles.tile,
              { backgroundColor: brand.ember.fill, boxShadow: `0px 2px 0px ${brand.ember.edge}` },
            ]}
            aria-hidden
          >
            <Icon name="bell" size={18} color="#FFFFFF" strokeWidth={2.2} />
          </View>
          <View style={styles.notifBody}>
            <Text style={styles.notifTitle}>Notifications</Text>
            <Text style={styles.notifSub} color="sub">
              Nothing new
            </Text>
          </View>
        </Pressable>

        <View style={styles.stats}>
          {profileStats().map((s) => (
            <View
              key={s.key}
              style={[styles.stat, { backgroundColor: colors.bg2 }]}
              accessible
              accessibilityLabel={`${s.label}, ${s.value}`}
            >
              <Text style={[styles.statValue, { color: s.money ? colors.money : colors.text }]}>
                {s.value}
              </Text>
              <Text style={styles.statLabel} color="sub">
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.section} accessibilityRole="header">
            Badges
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.badges}
          style={styles.badgeScroll}
        >
          {BADGE_PREVIEW.map((b) => (
            <View
              key={b.key}
              style={styles.badge}
              accessible
              accessibilityLabel={`${b.name}, not earned yet`}
            >
              <View style={[styles.badgeTile, { backgroundColor: b.color }]}>
                <Text style={styles.badgeMark}>{b.mark}</Text>
              </View>
              <Text style={styles.badgeName}>{b.name}</Text>
            </View>
          ))}
        </ScrollView>
        <Text color="sub" style={styles.empty}>
          Win games to earn badges.
        </Text>

        <Text style={[styles.section, styles.recent]} accessibilityRole="header">
          Recent games
        </Text>
        <Text color="sub" style={styles.empty}>
          No games yet. Your finished games show up here.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function IconButton({
  label,
  icon,
  size = 22,
  onPress,
}: {
  label: string;
  icon: 'back' | 'share' | 'bell' | 'gear';
  size?: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.iconBtn}
    >
      <Icon name={icon} size={size} color={colors.text} strokeWidth={icon === 'back' ? 2.2 : 2} />
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
  right: { flexDirection: 'row', gap: 4 },
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
  name: { fontSize: 26, fontFamily: 'BricolageGrotesque_800ExtraBold' },
  handle: { fontSize: 14, fontFamily: 'Figtree_500Medium' },
  friendsLink: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
  level: { alignSelf: 'stretch', marginTop: 8 },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  levelText: { fontSize: 13, fontFamily: 'Figtree_700Bold' },
  bar: { height: 8, borderRadius: 4, marginTop: 6, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: brand.online },
  notif: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
  },
  tile: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notifBody: { flex: 1 },
  notifTitle: { fontSize: 15, fontFamily: 'Figtree_700Bold' },
  notifSub: { fontSize: 12, fontFamily: 'Figtree_500Medium' },
  stats: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 10 },
  stat: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statValue: { fontSize: 17, fontFamily: 'Figtree_800ExtraBold' },
  statLabel: { fontSize: 11, marginTop: 2, fontFamily: 'Figtree_500Medium' },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 8,
  },
  section: { fontSize: 17, fontFamily: 'Figtree_700Bold' },
  recent: { marginHorizontal: 16, marginTop: 18, marginBottom: 4 },
  badgeScroll: { flexGrow: 0 },
  badges: { gap: 10, paddingHorizontal: 16 },
  badge: { width: 64, alignItems: 'center', gap: 4, opacity: 0.45 },
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
  empty: { fontSize: 13, paddingHorizontal: 16, paddingTop: 8, fontFamily: 'Figtree_500Medium' },
});
