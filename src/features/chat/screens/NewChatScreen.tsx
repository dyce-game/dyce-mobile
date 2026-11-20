import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { PillButton } from '@/components/PillButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { authErrorMessage } from '@/features/auth/messages';
import { FindByUsername } from '@/features/contacts/components/FindByUsername';
import { useInvitableContacts } from '@/features/contacts/use-invitable-contacts';
import { InviteSection } from '@/features/invites/components/InviteSection';
import { sessionStore } from '@/lib/api';
import { FriendRow } from '@/features/friends/components/FriendRow';
import { useFriendsQuery } from '@/features/friends/use-friends';
import { useOpenDirect } from '../use-chat';

/**
 * New chat (design: NewChat): pick a friend, or find someone by username. Opening a chat sends nothing;
 * a message to someone who isn't a friend goes to their Requests.
 */
export function NewChatScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const friends = useFriendsQuery();
  const open = useOpenDirect();
  const invitable = useInvitableContacts();
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState<string | null>(null);

  const start = (userId: string) => {
    setError(undefined);
    setPending(userId);
    open.mutate(userId, {
      onSuccess: (conv) => router.replace(`/c/${conv.id}` as Href),
      onError: (e) => setError(authErrorMessage(e)),
      onSettled: () => setPending(null),
    });
  };

  const list = friends.data?.friends ?? [];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="New chat" fallback="/chat" />

        {error ? (
          <Text color="accent" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Text variant="caption" color="sub" accessibilityRole="header">
          Friends
        </Text>
        {friends.isLoading ? <Text color="sub">Loading your friends…</Text> : null}
        {friends.isError ? (
          <View style={styles.block}>
            <Text color="accent">{authErrorMessage(friends.error)}</Text>
            <TokenButton label="Try again" tone="chip" onPress={() => void friends.refetch()} />
          </View>
        ) : null}
        {friends.isSuccess && list.length === 0 ? (
          <View style={styles.block}>
            <Text color="sub">
              You haven&apos;t added any friends yet. Find people from your contacts, or search for
              a username below.
            </Text>
            <TokenButton
              label="Add friends"
              tone="chip"
              onPress={() => router.push('/friends/add' as Href)}
            />
          </View>
        ) : null}
        {list.map((f) => (
          <FriendRow
            key={f.id}
            name={f.displayName}
            username={f.username}
            avatar={f.avatar}
            right={
              <PillButton
                label="Message"
                tone="primary"
                busy={pending === f.id}
                accessibilityLabel={`Message @${f.username}`}
                onPress={() => start(f.id)}
              />
            }
          />
        ))}

        <View style={styles.find}>
          <FindByUsername onMessage={(user) => start(user.id)} messaging={pending} />
        </View>

        <View style={styles.find}>
          <InviteSection
            contacts={invitable.data?.contacts ?? []}
            country={sessionStore.getState().country ?? undefined}
          />
          {invitable.data?.permission === 'needed' ? (
            <View style={styles.block}>
              <Text variant="footnote" color="sub">
                Allow contacts to see who you can invite from your address book.
              </Text>
              <TokenButton
                label="Find contacts to invite"
                tone="chip"
                onPress={() => router.push('/friends/contacts' as Href)}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 8 },
  block: { gap: 12 },
  find: { marginTop: 24 },
});
