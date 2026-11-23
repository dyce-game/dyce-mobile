import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAX_GROUP_MEMBERS } from '@dyce/shared';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { authErrorMessage } from '@/features/auth/messages';
import { useFriendsQuery } from '@/features/friends/use-friends';
import { FriendPicker } from '../components/FriendPicker';
import { useAddMembers, useGroupMembersQuery } from '../use-chat';

/** Add people to a group: your friends who aren't in it yet (only friends can be added). Admins only. */
export function AddMembersScreen({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const friends = useFriendsQuery();
  const members = useGroupMembersQuery(conversationId);
  const add = useAddMembers(conversationId);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  const inGroup = new Set(
    (members.data?.members ?? []).filter((m) => m.state === 'active').map((m) => m.user.id),
  );
  const candidates = (friends.data?.friends ?? []).filter((f) => !inGroup.has(f.id));
  const room = MAX_GROUP_MEMBERS - inGroup.size;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const back = () =>
    router.canGoBack() ? router.back() : router.replace(`/group-info/${conversationId}` as Href);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Add people" fallback={`/group-info/${conversationId}`} />
        {friends.isLoading || members.isLoading ? <Text color="sub">Loading…</Text> : null}
        {friends.isError || members.isError ? (
          <View style={styles.block}>
            <Text color="accent">{authErrorMessage(friends.error ?? members.error)}</Text>
            <TokenButton
              label="Try again"
              tone="chip"
              onPress={() => {
                void friends.refetch();
                void members.refetch();
              }}
            />
          </View>
        ) : null}
        {friends.isSuccess && members.isSuccess ? (
          <>
            <FriendPicker
              friends={candidates}
              selected={selected}
              onToggle={(id) => (selected.includes(id) || selected.length < room) && toggle(id)}
              query={query}
              onQuery={setQuery}
              empty="All your friends are already in this group."
            />
            <Text variant="footnote" color="sub">
              Only your friends can be added. Room for {room} more.
            </Text>
            <TokenButton
              label={
                add.isPending ? 'Adding…' : selected.length > 0 ? `Add ${selected.length}` : 'Add'
              }
              disabled={selected.length === 0 || add.isPending}
              onPress={() => add.mutate(selected, { onSuccess: back })}
            />
          </>
        ) : null}
        {add.isError ? (
          <Text color="accent" accessibilityLiveRegion="polite">
            {authErrorMessage(add.error)}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 12, paddingBottom: 60 },
  block: { gap: 12 },
});
