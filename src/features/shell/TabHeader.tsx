import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Icon, Text, brand, useTheme } from '@dyce/ui';
import { useFriendRequestsQuery } from '@/features/friends/use-friends';

/**
 * Tab title row. Profile avatar top-left (ember ring), optional "+" top-right (Chat and Spaces only).
 * Real avatars arrive with the avatar engine in Phase 1; this shows a placeholder initial.
 *
 * Until the Profile screen exists, the avatar opens Friends (which the design reaches from Profile), and
 * shows how many friend requests are waiting.
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
  const waiting = useFriendRequestsQuery().data?.incoming.length ?? 0;
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            waiting > 0
              ? `Friends, ${waiting} ${waiting === 1 ? 'request' : 'requests'} waiting`
              : 'Friends'
          }
          onPress={() => router.push('/friends' as Href)}
          style={[styles.avatar, { borderColor: brand.ember.fill, backgroundColor: colors.chip }]}
        >
          <Text variant="callout">K</Text>
          {waiting > 0 ? (
            <View
              style={[styles.badge, { backgroundColor: brand.ember.fill, borderColor: colors.bg }]}
              aria-hidden
            >
              <Text variant="caption" style={{ color: brand.ember.text }}>
                {waiting > 9 ? '9+' : waiting}
              </Text>
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
                { backgroundColor: brand.ember.fill, borderBottomColor: brand.ember.edge },
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
  wrap: { gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -10,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
