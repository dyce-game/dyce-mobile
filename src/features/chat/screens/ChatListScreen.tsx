import { useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FilterTabs, Icon, Text, brand, useTheme } from '@dyce/ui';
import { Glow } from '@/components/Glow';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { TabHeader } from '@/features/shell/TabHeader';
import { CHAT_TABS, filterForTab, rowsForTab, type ChatTab } from '../chat-logic';
import { ConversationRow } from '../components/ConversationRow';
import { RequestCard } from '../components/RequestCard';
import { useAcceptConversation, useConversationsQuery, useDeclineConversation } from '../use-chat';

/**
 * The Chat tab (design: Chats, Requests, EmptyChats). Five filters. All and Friends list your conversations,
 * newest first; Requests holds messages from people you don't know yet (nothing from a stranger is ever in
 * All); Groups and Bots arrive with those features. "N playing", "Live now" and the online dots need presence,
 * which doesn't exist yet, so they are left out rather than invented.
 */
export function ChatListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const myId = useSession((s) => s.userId);
  const [tab, setTab] = useState<ChatTab>('all');
  const query = useConversationsQuery(filterForTab(tab));
  const accept = useAcceptConversation();
  const decline = useDeclineConversation();

  const rows = rowsForTab(tab, query.data?.conversations ?? []);
  const requestCount = query.data?.requestCount ?? 0;
  const tabs = CHAT_TABS.map((t) => ({
    ...t,
    count: t.key === 'requests' ? requestCount : 0,
  }));

  const open = (id: string) => router.push(`/c/${id}` as Href);
  const newChat = () => router.push('/c/new' as Href);

  const intro =
    tab === 'requests' ? (
      <View>
        <View style={[styles.privacy, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={[styles.shield, { backgroundColor: colors.brandSoft }]} aria-hidden>
            <Icon name="shield" size={18} color={colors.accent} />
          </View>
          <Text style={styles.privacyText}>
            From people outside your contacts. They can&apos;t see your number or whether
            you&apos;ve opened these.
          </Text>
        </View>
        {requestCount > 0 ? (
          <View style={styles.labels}>
            <View style={[styles.label, { backgroundColor: colors.ink }]}>
              <Text style={[styles.labelText, { color: colors.inkText }]}>
                Messages · {requestCount}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    ) : null;

  const empty = query.isLoading ? (
    <Text color="sub" style={styles.loading}>
      Loading your chats…
    </Text>
  ) : query.isError ? (
    <View style={styles.errorBox}>
      <Text color="accent">{authErrorMessage(query.error)}</Text>
      <Action
        label="Try again"
        detail="Check your connection"
        onPress={() => void query.refetch()}
      />
    </View>
  ) : (
    <EmptyState
      tab={tab}
      actions={
        tab === 'all' || tab === 'friends' ? (
          <>
            <Action primary label="New chat" detail="Message a friend" onPress={newChat} />
            <Action
              label="Add friends"
              detail="From your contacts or by @username"
              onPress={() => router.push('/friends/add' as Href)}
            />
          </>
        ) : null
      }
    />
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Glow />
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.top}>
          <TabHeader title="Chat" onPlus={newChat} />
        </View>
        <FilterTabs tabs={tabs} selected={tab} onSelect={setTab} label="Chat filter" />
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={intro ?? undefined}
          ListEmptyComponent={empty}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
            />
          }
          renderItem={({ item }) =>
            item.state === 'request' ? (
              <RequestCard
                conversation={item}
                onOpen={() => open(item.id)}
                onAccept={() => accept.mutate(item.id, { onSuccess: () => open(item.id) })}
                onDecline={() => decline.mutate(item.id)}
                onSafety={() => router.push(`/chat-info/${item.id}` as Href)}
                accepting={accept.isPending && accept.variables === item.id}
                declining={decline.isPending && decline.variables === item.id}
              />
            ) : (
              <ConversationRow conversation={item} myId={myId} onPress={() => open(item.id)} />
            )
          }
        />
      </SafeAreaView>
    </View>
  );
}

const COPY: Record<ChatTab, { title: string; body: string }> = {
  all: {
    title: 'No chats yet',
    body: 'Start a chat with a friend, or add friends from your contacts to get going.',
  },
  friends: {
    title: 'No friend chats yet',
    body: 'Say hi to a friend and your chat will show up here.',
  },
  groups: {
    title: 'No group chats yet',
    body: 'Group chats are coming. Your friends and games will be here in one place.',
  },
  requests: {
    title: 'No requests',
    body: 'When someone outside your contacts messages you, it lands here first so it never crowds your chats.',
  },
  bots: {
    title: 'No bots yet',
    body: 'Practice bots are coming. You will be able to play them any time.',
  },
};

function EmptyState({ tab, actions }: { tab: ChatTab; actions: ReactNode }) {
  const { colors } = useTheme();
  const c = COPY[tab];
  return (
    <View style={styles.empty}>
      <View style={styles.art} aria-hidden>
        <View style={[styles.bubble, styles.bubbleA, { backgroundColor: colors.chip }]} />
        <View style={[styles.bubble, styles.bubbleB, { backgroundColor: brand.ember.fill }]} />
        <View style={[styles.artBadge, { backgroundColor: brand.brass.fill }]}>
          <Icon name="chat" size={30} color={brand.brass.text} />
        </View>
      </View>
      <Text accessibilityRole="header" style={styles.emptyTitle}>
        {c.title}
      </Text>
      <Text color="sub" style={styles.emptyBody}>
        {c.body}
      </Text>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

function Action({
  label,
  detail,
  onPress,
  primary,
}: {
  label: string;
  detail: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const { colors } = useTheme();
  const fg = primary ? '#FFFFFF' : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.action, { backgroundColor: primary ? brand.ember.fill : colors.bg2 }]}
    >
      <View style={styles.actionBody}>
        <Text style={[styles.actionTitle, { color: fg }]}>{label}</Text>
        <Text style={[styles.actionDetail, { color: fg }]}>{detail}</Text>
      </View>
      <View style={styles.chevron}>
        <Icon name="back" size={16} color={fg} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { paddingHorizontal: 18 },
  content: { paddingTop: 6, paddingBottom: 140, flexGrow: 1 },
  loading: { paddingHorizontal: 18, paddingTop: 20 },
  errorBox: { paddingHorizontal: 18, paddingTop: 20, gap: 12 },
  privacy: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  shield: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: 'Figtree_500Medium' },
  labels: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  label: { height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center' },
  labelText: { fontSize: 13, fontFamily: 'Figtree_800ExtraBold' },
  empty: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 30 },
  art: { width: 200, height: 150 },
  bubble: { position: 'absolute', width: 110, height: 44, borderRadius: 22 },
  bubbleA: { left: 10, top: 30, borderBottomLeftRadius: 8 },
  bubbleB: { left: 80, top: 86, borderBottomRightRadius: 8 },
  artBadge: {
    position: 'absolute',
    left: 70,
    top: 10,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 6,
    fontSize: 24,
    letterSpacing: -0.3,
    textAlign: 'center',
    fontFamily: 'BricolageGrotesque_700Bold',
  },
  emptyBody: { fontSize: 15, lineHeight: 22, maxWidth: 300, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 22 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    minHeight: 60,
    borderRadius: 16,
  },
  actionBody: { flex: 1 },
  actionTitle: { fontSize: 15, fontFamily: 'Figtree_700Bold' },
  actionDetail: { fontSize: 12, opacity: 0.8, fontFamily: 'Figtree_500Medium' },
  chevron: { transform: [{ rotate: '180deg' }] },
});
