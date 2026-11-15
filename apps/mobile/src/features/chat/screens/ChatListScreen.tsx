import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ConversationFilter } from '@dyce/shared';
import { Chip, Text, TokenButton, useTheme } from '@dyce/ui';
import { PillButton } from '@/components/PillButton';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { TabHeader } from '@/features/shell/TabHeader';
import { ConversationRow } from '../components/ConversationRow';
import { useAcceptConversation, useConversationsQuery, useDeclineConversation } from '../use-chat';

const FILTERS: { key: ConversationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'friends', label: 'Friends' },
  { key: 'requests', label: 'Requests' },
];

/**
 * The Chat tab (design: Chats, Requests). All and Friends list your conversations, newest first. Requests
 * holds messages from people you don't know yet: nothing from a stranger is ever in All. Groups and Bots
 * filters arrive with those features.
 */
export function ChatListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const myId = useSession((s) => s.userId);
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const query = useConversationsQuery(filter);
  const accept = useAcceptConversation();
  const decline = useDeclineConversation();

  const rows = query.data?.conversations ?? [];
  const requestCount = query.data?.requestCount ?? 0;

  const open = (id: string) => router.push(`/c/${id}` as Href);

  const header = (
    <View style={styles.header}>
      <TabHeader title="Chat" onPlus={() => router.push('/c/new' as Href)} />
      <View style={styles.chips} accessibilityRole="tablist">
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={
              f.key === 'requests' && requestCount > 0 ? `Requests · ${requestCount}` : f.label
            }
            selected={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </View>
      {filter === 'requests' ? (
        <View style={[styles.privacy, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text variant="footnote" color="sub">
            From people outside your friends. They can&apos;t see your number or whether you&apos;ve
            opened these.
          </Text>
        </View>
      ) : null}
    </View>
  );

  const empty = query.isLoading ? (
    <Text color="sub" style={styles.empty}>
      Loading your chats…
    </Text>
  ) : query.isError ? (
    <View style={styles.empty}>
      <Text color="accent">{authErrorMessage(query.error)}</Text>
      <TokenButton label="Try again" tone="chip" onPress={() => void query.refetch()} />
    </View>
  ) : filter === 'requests' ? (
    <View style={styles.empty}>
      <Text variant="headline">No requests</Text>
      <Text color="sub">
        When someone you don&apos;t know messages you, it shows up here first.
      </Text>
    </View>
  ) : filter === 'friends' ? (
    <View style={styles.empty}>
      <Text variant="headline">No friend chats yet</Text>
      <Text color="sub">Say hi to a friend and your chat will show up here.</Text>
      <TokenButton label="New chat" onPress={() => router.push('/c/new' as Href)} />
    </View>
  ) : (
    <View style={styles.empty}>
      <Text variant="headline">No chats yet</Text>
      <Text color="sub">
        Start a chat with a friend, or add friends from your contacts to get going.
      </Text>
      <TokenButton label="New chat" onPress={() => router.push('/c/new' as Href)} />
      <TokenButton
        label="Add friends"
        tone="chip"
        onPress={() => router.push('/friends/add' as Href)}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            myId={myId}
            onPress={() => open(item.id)}
            actions={
              item.state === 'request' ? (
                <>
                  <PillButton
                    label="Accept"
                    tone="primary"
                    busy={accept.isPending && accept.variables === item.id}
                    accessibilityLabel={`Accept chat with @${item.peer.username}`}
                    onPress={() => accept.mutate(item.id, { onSuccess: () => open(item.id) })}
                  />
                  <PillButton
                    label="Decline"
                    busy={decline.isPending && decline.variables === item.id}
                    accessibilityLabel={`Decline chat from @${item.peer.username}`}
                    onPress={() => decline.mutate(item.id)}
                  />
                </>
              ) : undefined
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 140, flexGrow: 1 },
  header: { gap: 14, paddingTop: 8, paddingBottom: 8 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  privacy: { borderWidth: 1, borderRadius: 16, padding: 12 },
  empty: { gap: 12, paddingTop: 28 },
});
