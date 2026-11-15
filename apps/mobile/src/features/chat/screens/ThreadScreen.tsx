import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text, TokenButton, useTheme } from '@dyce/ui';
import { InitialAvatar } from '@/components/InitialAvatar';
import { PillButton } from '@/components/PillButton';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { sendTypingSignal } from '@/lib/realtime';
import {
  buildThreadItems,
  flattenPages,
  mergeOutbox,
  receiptFor,
  type ThreadItem,
} from '../chat-logic';
import { Composer } from '../components/Composer';
import { DaySeparator, MessageBubble } from '../components/MessageBubble';
import { useOutbox } from '../outbox';
import { useIsTyping } from '../typing';
import {
  useAcceptConversation,
  useConversationQuery,
  useDeclineConversation,
  useMarkRead,
  useSendMessage,
  useThreadQuery,
} from '../use-chat';

/**
 * A conversation (design: Thread). Newest message at the bottom, optimistic sending with Retry, "typing…"
 * and Sent/Read under your last message. A conversation from someone you don't know is a request: you read
 * it, then Accept or Decline before you can answer.
 */
export function ThreadScreen({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const myId = useSession((s) => s.userId);

  const conv = useConversationQuery(conversationId);
  const thread = useThreadQuery(conversationId);
  const outbox = useOutbox(conversationId);
  const typing = useIsTyping(conversationId);
  const { send, retry, discard } = useSendMessage(conversationId);
  const accept = useAcceptConversation();
  const decline = useDeclineConversation();
  const markRead = useMarkRead(conversationId);

  const server = useMemo(() => flattenPages(thread.data), [thread.data]);
  const messages = useMemo(() => mergeOutbox(server, outbox), [server, outbox]);
  const items = useMemo(() => buildThreadItems(messages, myId), [messages, myId]);
  const peerReadAt = thread.data?.pages[0]?.peerReadAt ?? null;
  const receipt = receiptFor(messages, myId, peerReadAt);

  const peer = conv.data?.peer;
  const name = peer?.displayName || peer?.username || 'Chat';
  const isRequest = conv.data?.state === 'request';

  // Tell the server what we've read: when the thread opens with unread messages, and as new ones arrive.
  const newestFromThem = server.find((m) => m.senderId !== myId)?.id ?? null;
  const markedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!thread.isSuccess || !conv.isSuccess) return;
    if (conv.data.unread > 0 || (newestFromThem && newestFromThem !== markedFor.current)) {
      markedFor.current = newestFromThem;
      markRead();
    }
  }, [thread.isSuccess, conv.isSuccess, conv.data?.unread, newestFromThem, markRead]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/chat' as Href));

  const missing =
    (conv.isError && conv.error instanceof ApiError && conv.error.status === 404) ||
    (thread.isError && thread.error instanceof ApiError && thread.error.status === 404);

  const header = (
    <View style={[styles.header, { borderColor: colors.line, backgroundColor: colors.bg }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to chats"
        onPress={goBack}
        style={styles.side}
      >
        <Icon name="back" color={colors.text} />
      </Pressable>
      <View style={styles.title} accessibilityRole="header">
        <InitialAvatar name={name} size={38} />
        <Text variant="callout" numberOfLines={1}>
          {name}
        </Text>
        <Text
          variant="footnote"
          color={typing ? 'accent' : 'sub'}
          numberOfLines={1}
          accessibilityLiveRegion="polite"
        >
          {typing ? 'typing…' : peer ? `@${peer.username}` : ' '}
        </Text>
      </View>
      <View style={styles.side} />
    </View>
  );

  if (missing) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        {header}
        <View style={styles.center}>
          <Text variant="headline">This chat isn&apos;t available</Text>
          <TokenButton label="Back to chats" onPress={goBack} />
        </View>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: ThreadItem }) =>
    item.kind === 'day' ? (
      <DaySeparator label={item.label} time={item.time} />
    ) : (
      <MessageBubble
        item={item}
        who={item.mine ? 'You' : name}
        receipt={receipt?.id === item.message.id ? receipt.label : null}
        onRetry={retry}
        onDiscard={discard}
      />
    );

  const footer = isRequest ? (
    <View style={[styles.request, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Text variant="footnote" color="sub">
        {name} isn&apos;t one of your friends yet. They can&apos;t see that you&apos;ve opened this.
        Accept to start chatting, or decline to hide it.
      </Text>
      <View style={styles.requestActions}>
        <PillButton
          label="Accept"
          tone="primary"
          busy={accept.isPending}
          accessibilityLabel={`Accept chat with @${peer?.username ?? ''}`}
          onPress={() => accept.mutate(conversationId)}
        />
        <PillButton
          label="Decline"
          busy={decline.isPending}
          accessibilityLabel={`Decline chat from @${peer?.username ?? ''}`}
          onPress={() => decline.mutate(conversationId, { onSuccess: goBack })}
        />
      </View>
      {accept.isError || decline.isError ? (
        <Text variant="footnote" color="accent" accessibilityLiveRegion="polite">
          {authErrorMessage(accept.error ?? decline.error)}
        </Text>
      ) : null}
    </View>
  ) : (
    <>
      {peer &&
      peer.relationship !== 'friends' &&
      !server.some((m) => m.senderId !== myId) &&
      server.length > 0 ? (
        <Text variant="footnote" color="sub" style={styles.note}>
          {name} isn&apos;t a friend yet, so this goes to their Requests until they reply.
        </Text>
      ) : null}
      <Composer
        onSend={send}
        onTyping={(on) => sendTypingSignal(conversationId, on)}
        placeholder={peer ? `Message ${name}` : 'Dyce message'}
      />
    </>
  );

  const loading = thread.isLoading || conv.isLoading;
  const empty = thread.isSuccess && items.length === 0;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      {header}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.sub} />
          </View>
        ) : thread.isError ? (
          <View style={styles.center}>
            <Text color="accent">{authErrorMessage(thread.error)}</Text>
            <TokenButton label="Try again" tone="chip" onPress={() => void thread.refetch()} />
          </View>
        ) : empty ? (
          <View style={styles.center}>
            <Text variant="headline">Say hi to {name}</Text>
            <Text color="sub" style={styles.centerText}>
              {isRequest ? 'Nothing here yet.' : 'Your messages will show up here.'}
            </Text>
          </View>
        ) : (
          <FlatList
            style={styles.flex}
            data={items}
            inverted
            keyExtractor={(i) => i.key}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (thread.hasNextPage && !thread.isFetchingNextPage) void thread.fetchNextPage();
            }}
            ListFooterComponent={
              thread.isFetchingNextPage ? (
                <ActivityIndicator color={colors.sub} style={styles.more} />
              ) : undefined
            }
          />
        )}
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  side: { minWidth: 56, minHeight: 44, justifyContent: 'center', paddingLeft: 8 },
  title: { alignItems: 'center', gap: 2, flex: 1 },
  list: { paddingHorizontal: 14, paddingVertical: 10 },
  more: { padding: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  centerText: { textAlign: 'center' },
  note: { textAlign: 'center', paddingHorizontal: 20, paddingTop: 6 },
  request: { padding: 14, gap: 12, borderTopWidth: 1 },
  requestActions: { flexDirection: 'row', gap: 8 },
});
