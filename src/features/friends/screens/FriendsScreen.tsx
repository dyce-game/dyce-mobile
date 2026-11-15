import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip, Text, TokenButton, useTheme } from '@dyce/ui';
import { PillButton } from '@/components/PillButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { authErrorMessage } from '@/features/auth/messages';
import { FriendRow } from '../components/FriendRow';
import { mutualLabel, tabLabel, timeAgo } from '../format';
import {
  useAcceptRequest,
  useCancelRequest,
  useFriendRequestsQuery,
  useFriendsQuery,
  useIgnoreRequest,
  useRemoveFriend,
} from '../use-friends';

type Tab = 'all' | 'requests';

/**
 * Friends (docs: design/Friends.dc.html). "All" lists friends with a confirm-to-remove step; "Requests"
 * has people who want to be your friend (Accept / Ignore, ignoring is private) and people you asked
 * (Cancel). Swipe-to-remove from the design is replaced by an explicit Remove button, which works with
 * screen readers and keyboards.
 */
export function FriendsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('all');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  const friends = useFriendsQuery();
  const requests = useFriendRequestsQuery();
  const accept = useAcceptRequest();
  const ignore = useIgnoreRequest();
  const cancel = useCancelRequest();
  const remove = useRemoveFriend();

  const incoming = requests.data?.incoming ?? [];
  const outgoing = requests.data?.outgoing ?? [];
  const list = friends.data?.friends ?? [];

  const run = (
    mutation: {
      mutate: (id: string, o: { onError: (e: unknown) => void; onSuccess?: () => void }) => void;
    },
    id: string,
    after?: () => void,
  ) => {
    setError(undefined);
    mutation.mutate(id, { onError: (e) => setError(authErrorMessage(e)), onSuccess: after });
  };

  const body =
    tab === 'all' ? (
      <View style={styles.section}>
        {friends.isLoading ? <Text color="sub">Loading your friends…</Text> : null}
        {friends.isError ? (
          <View style={styles.block}>
            <Text color="accent">{authErrorMessage(friends.error)}</Text>
            <TokenButton label="Try again" tone="chip" onPress={() => void friends.refetch()} />
          </View>
        ) : null}
        {friends.isSuccess && list.length === 0 ? (
          <View style={styles.block}>
            <Text variant="headline">No friends yet</Text>
            <Text color="sub">
              Find people from your contacts, or search for a username. Friends can send you games
              directly.
            </Text>
            <TokenButton label="Add friends" onPress={() => router.push('/friends/add' as Href)} />
          </View>
        ) : null}
        {list.map((f) => (
          <FriendRow
            key={f.id}
            name={f.displayName}
            username={f.username}
            avatar={f.avatar}
            right={
              confirmingId === f.id ? null : (
                <PillButton
                  label="Remove"
                  accessibilityLabel={`Remove @${f.username}`}
                  onPress={() => setConfirmingId(f.id)}
                />
              )
            }
            below={
              confirmingId === f.id ? (
                <View style={styles.confirm} accessibilityLiveRegion="polite">
                  <Text variant="footnote" color="sub" style={styles.confirmText}>
                    Remove @{f.username}? They won&apos;t be told.
                  </Text>
                  <PillButton
                    label="Keep"
                    onPress={() => setConfirmingId(null)}
                    accessibilityLabel={`Keep @${f.username}`}
                  />
                  <PillButton
                    label="Remove"
                    tone="danger"
                    busy={remove.isPending}
                    accessibilityLabel={`Confirm remove @${f.username}`}
                    onPress={() => run(remove, f.id, () => setConfirmingId(null))}
                  />
                </View>
              ) : null
            }
          />
        ))}
      </View>
    ) : (
      <View style={styles.section}>
        {requests.isLoading ? <Text color="sub">Loading requests…</Text> : null}
        {requests.isError ? (
          <View style={styles.block}>
            <Text color="accent">{authErrorMessage(requests.error)}</Text>
            <TokenButton label="Try again" tone="chip" onPress={() => void requests.refetch()} />
          </View>
        ) : null}
        {requests.isSuccess && incoming.length === 0 && outgoing.length === 0 ? (
          <View style={styles.block}>
            <Text variant="headline">No requests right now</Text>
            <Text color="sub">
              When someone wants to be your friend, they&apos;ll show up here.
            </Text>
          </View>
        ) : null}

        {incoming.length > 0 ? (
          <>
            <Text variant="caption" color="sub" accessibilityRole="header">
              Want to be friends
            </Text>
            {incoming.map((r) => (
              <FriendRow
                key={r.user.id}
                name={r.user.displayName}
                username={r.user.username}
                avatar={r.user.avatar}
                detail={[mutualLabel(r.mutualFriends), timeAgo(r.requestedAt)]
                  .filter(Boolean)
                  .join(' · ')}
                below={
                  <>
                    <PillButton
                      label="Accept"
                      tone="primary"
                      busy={accept.isPending && accept.variables === r.user.id}
                      accessibilityLabel={`Accept @${r.user.username}`}
                      onPress={() => run(accept, r.user.id)}
                    />
                    <PillButton
                      label="Ignore"
                      busy={ignore.isPending && ignore.variables === r.user.id}
                      accessibilityLabel={`Ignore @${r.user.username}`}
                      onPress={() => run(ignore, r.user.id)}
                    />
                  </>
                }
              />
            ))}
          </>
        ) : null}

        {outgoing.length > 0 ? (
          <>
            <Text variant="caption" color="sub" accessibilityRole="header" style={styles.gap}>
              You asked
            </Text>
            {outgoing.map((r) => (
              <FriendRow
                key={r.user.id}
                name={r.user.displayName}
                username={r.user.username}
                avatar={r.user.avatar}
                detail={`Sent ${timeAgo(r.requestedAt)}`}
                right={
                  <PillButton
                    label="Cancel"
                    busy={cancel.isPending && cancel.variables === r.user.id}
                    accessibilityLabel={`Cancel request to @${r.user.username}`}
                    onPress={() => run(cancel, r.user.id)}
                  />
                }
              />
            ))}
          </>
        ) : null}

        <Text variant="footnote" color="sub" style={styles.gap}>
          Friends can send you games directly to Chats, request Dyce Cash and see when you&apos;re
          active. Everyone else goes to Requests.
        </Text>
      </View>
    );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title="Friends"
          right={
            <PillButton
              label="Add friends"
              tone="primary"
              onPress={() => router.push('/friends/add' as Href)}
            />
          }
        />
        <View style={styles.tabs} accessibilityRole="tablist">
          <Chip
            label={tabLabel('All', list.length)}
            selected={tab === 'all'}
            onPress={() => setTab('all')}
          />
          <Chip
            label={tabLabel('Requests', incoming.length, true)}
            selected={tab === 'requests'}
            onPress={() => setTab('requests')}
          />
        </View>
        {error ? (
          <Text color="accent" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {body}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Blocked people"
          onPress={() => router.push('/settings/blocked' as Href)}
          style={styles.blockedLink}
        >
          <Text variant="callout" color="sub">
            Blocked people
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 12 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 4 },
  section: { gap: 8 },
  block: { gap: 10, paddingTop: 12 },
  gap: { marginTop: 12 },
  confirm: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, flex: 1 },
  confirmText: { flexBasis: '100%' },
  blockedLink: { minHeight: 44, justifyContent: 'center', marginTop: 12 },
});
