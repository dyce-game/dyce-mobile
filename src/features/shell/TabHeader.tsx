import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Icon, Text, brand, useTheme } from '@dyce/ui';
import { useMeQuery } from '@/features/avatar/use-avatar';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { useUnreadCount } from '@/features/notifications/use-notifications';

/**
 * Tab title row. Profile avatar top-left (ember ring), optional "+" top-right (Chat and Spaces only).
 * Real avatars arrive with the avatar engine in Phase 1; this shows a placeholder initial.
 *
 * The avatar opens your profile (Friends, Edit profile and Settings are reached from there) and shows how many
 * friend requests are waiting.
 */
export function TabHeader({
  title,
  onPlus,
  right,
  compact,
}: {
  title: string;
  onPlus?: () => void;
  right?: ReactNode;
  /** The Wallet design uses a slightly smaller, lighter title (34 / 700) than Chat and Spaces (38 / 800). */
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const waiting = useUnreadCount();
  const mine = useMeQuery().data?.profile;
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            waiting > 0
              ? `My profile, ${waiting} unread ${waiting === 1 ? 'notification' : 'notifications'}`
              : 'My profile'
          }
          onPress={() => router.push('/profile' as Href)}
          style={[styles.ring, { backgroundColor: brand.ember.fill }]}
        >
          <View style={[styles.gap, { backgroundColor: colors.bg }]}>
            <UserAvatar
              avatar={mine?.avatar}
              name={mine?.displayName || mine?.username || 'You'}
              size={38}
            />
          </View>
          {waiting > 0 ? (
            <View
              style={[styles.badge, { backgroundColor: brand.ember.fill, borderColor: colors.bg }]}
              aria-hidden
            >
              <Text style={styles.badgeText}>{waiting > 9 ? '9+' : waiting}</Text>
            </View>
          ) : null}
        </Pressable>
        {right ??
          (onPlus ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`New in ${title}`}
              onPress={onPlus}
              style={[
                styles.plus,
                {
                  backgroundColor: brand.ember.fill,
                  boxShadow: `0px 3px 0px ${brand.ember.edge}, 0px 8px 18px rgba(201,62,28,0.32)`,
                },
              ]}
            >
              <Icon name="plus" size={22} color={brand.ember.text} />
            </Pressable>
          ) : null)}
      </View>
      <Text
        variant="display"
        accessibilityRole="header"
        style={compact ? styles.compactTitle : undefined}
      >
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compactTitle: { fontSize: 34, letterSpacing: -0.6, fontFamily: 'BricolageGrotesque_700Bold' },
  wrap: { gap: 10 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  // The profile avatar sits in a 2pt page-coloured gap inside a 2pt ember ring (the design's double ring).
  ring: { width: 46, height: 46, borderRadius: 23, padding: 2 },
  gap: { flex: 1, borderRadius: 21, padding: 2 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontFamily: 'Figtree_800ExtraBold' },
  plus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
});
