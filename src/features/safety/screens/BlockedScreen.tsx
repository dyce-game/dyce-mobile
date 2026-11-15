import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { authErrorMessage } from '@/features/auth/messages';
import { blockedLabel } from '../safety-logic';
import { useBlockedQuery, useUnblockUser } from '../use-safety';

/**
 * Blocked people (design: BlockedList). Each row has an Unblock pill. Blocked people can't message you, send you
 * money or find you, and they aren't told; unblocking doesn't make you friends again.
 */
export function BlockedScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const blocked = useBlockedQuery();
  const unblock = useUnblockUser();
  const list = blocked.data?.blocked ?? [];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/friends' as Href));

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={back}
          style={styles.side}
        >
          <Text style={[styles.back, { color: colors.accent }]}>Back</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Blocked
        </Text>
        <View style={styles.side} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text color="sub" style={styles.intro}>
          Blocked people can&apos;t message you, send you money or find you. They aren&apos;t told.
        </Text>

        {blocked.isLoading ? <Text color="sub">Loading…</Text> : null}
        {blocked.isError ? (
          <View style={styles.block}>
            <Text color="accent">{authErrorMessage(blocked.error)}</Text>
            <TokenButton label="Try again" tone="chip" onPress={() => void blocked.refetch()} />
          </View>
        ) : null}
        {blocked.isSuccess && list.length === 0 ? (
          <Text color="sub">You haven&apos;t blocked anyone.</Text>
        ) : null}

        {list.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.bg2 }]}>
            {list.map((b, i) => (
              <View
                key={b.user.id}
                style={[
                  styles.row,
                  { borderColor: colors.line, borderBottomWidth: i === list.length - 1 ? 0 : 1 },
                ]}
              >
                <UserAvatar
                  avatar={b.user.avatar}
                  name={b.user.displayName || b.user.username}
                  size={40}
                />
                <View style={styles.body}>
                  <Text style={styles.handle}>@{b.user.username}</Text>
                  <Text style={styles.when} color="sub">
                    {blockedLabel(b.blockedAt)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Unblock @${b.user.username}`}
                  disabled={unblock.isPending && unblock.variables === b.user.id}
                  onPress={() => unblock.mutate(b.user.id)}
                  style={[styles.pill, { backgroundColor: colors.bg }]}
                >
                  <Text style={styles.pillText}>
                    {unblock.isPending && unblock.variables === b.user.id ? '…' : 'Unblock'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {unblock.isError ? (
          <Text color="accent" accessibilityLiveRegion="polite">
            {authErrorMessage(unblock.error)}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  side: { width: 64, minHeight: 44, justifyContent: 'center' },
  back: { fontSize: 17, fontFamily: 'Figtree_500Medium' },
  title: { fontSize: 17, fontFamily: 'Figtree_600SemiBold' },
  content: { paddingHorizontal: 16, paddingBottom: 30, gap: 12 },
  intro: { fontSize: 14, lineHeight: 20, paddingTop: 12, fontFamily: 'Figtree_500Medium' },
  block: { gap: 10 },
  card: { borderRadius: 18, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
  },
  body: { flex: 1, minWidth: 0 },
  handle: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  when: { fontSize: 12, fontFamily: 'Figtree_500Medium' },
  pill: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontSize: 13, fontFamily: 'Figtree_700Bold' },
});
