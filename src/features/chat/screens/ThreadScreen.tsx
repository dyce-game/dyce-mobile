import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { ReactionKey, ReplyPreview } from '@dyce/shared';
import { Icon, Text, TokenButton, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { PillButton } from '@/components/PillButton';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { copyText } from '@/lib/copy-text';
import { sendTypingSignal } from '@/lib/realtime';
import {
  availableActions,
  buildThreadItems,
  DELETE_WINDOW_MS,
  flattenPages,
  memberCountLabel,
  mergeOutbox,
  myReaction,
  receiptFor,
  replyPreviewOf,
  senderLookup,
  type MessageAction,
  type ThreadItem,
  type ThreadMessage,
} from '../chat-logic';
import { reportHref } from '@/features/safety/safety-logic';
import { BotTile, GroupAvatar } from '../components/ChatAvatars';
import { Composer } from '../components/Composer';
import { DaySeparator, MessageBubble } from '../components/MessageBubble';
import { MessageActionsSheet } from '../components/MessageActionsSheet';
import { ThreadPlusSheet } from '../components/ThreadPlusSheet';
import { useOutbox } from '../outbox';
import { useIsTyping } from '../typing';
import {
  useAcceptConversation,
  useConversationQuery,
  useDeclineConversation,
  useDeleteMessage,
  useGroupMembersQuery,
  useMarkRead,
  useReact,
  useSendMessage,
  useThreadQuery,
  useVote,
} from '../use-chat';

/**
 * A conversation (design: Thread, GroupChat). Newest message at the bottom, optimistic sending with Retry,
 * "typing…" and Sent/Read under your last message. A conversation from someone you don't know is a request:
 * you read it, then Accept or Decline before you can answer. Three shapes share this screen:
 *
 * - **a person**: the header opens Chat info; friends get the Ð button and the games button;
 * - **a group**: the header shows who is in it and opens the group's page; each message carries the sender's
 *   name and avatar; polls; the + button makes polls and starts a Space;
 * - **a practice bot**: a scripted partner, no read receipts, nothing to report or block.
 *
 * Long-press a message (right-click on web) for reactions, Reply, Copy, Delete and Report.
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
  const react = useReact(conversationId);
  const deleteMessage = useDeleteMessage(conversationId);
  const vote = useVote(conversationId);

  const summary = conv.data;
  const kind = summary?.kind ?? 'direct';
  const isGroup = kind === 'group';
  const isBot = kind === 'bot';
  const members = useGroupMembersQuery(conversationId, isGroup);
  const lookup = useMemo(() => senderLookup(members.data?.members), [members.data]);

  const [menu, setMenu] = useState<ThreadMessage | null>(null);
  const [plus, setPlus] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    setReplyTo(null);
    setMenu(null);
  }, [conversationId]);

  const server = useMemo(() => flattenPages(thread.data), [thread.data]);
  const messages = useMemo(() => mergeOutbox(server, outbox), [server, outbox]);
  const items = useMemo(() => buildThreadItems(messages, myId), [messages, myId]);
  const peerReadAt = thread.data?.pages[0]?.peerReadAt ?? null;
  const receipt = receiptFor(messages, myId, peerReadAt);

  const peer = summary?.peer;
  const name =
    summary?.kind === 'group'
      ? summary.group.title
      : summary?.kind === 'bot'
        ? summary.bot.name
        : peer?.displayName || peer?.username || 'Chat';
  const isRequest = summary?.state === 'request';

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

  /** Who wrote a message, for the spoken label and the quote. */
  const senderName = useCallback(
    (m: { senderId: string }) =>
      m.senderId === myId ? 'You' : isGroup ? lookup(m.senderId).name : name,
    [myId, isGroup, lookup, name],
  );

  const openMenu = useCallback((m: ThreadMessage) => setMenu(m), []);
  const menuActions: MessageAction[] =
    menu && summary
      ? availableActions(menu, {
          myId,
          conversationKind: summary.kind,
          canAnswer: summary.state === 'active',
        })
      : [];

  const flash = (text: string | null) => {
    if (text) setNotice(text);
  };

  const onMenuAction = (action: Exclude<MessageAction, 'react'>) => {
    const m = menu;
    setMenu(null);
    if (!m) return;
    switch (action) {
      case 'reply':
        setReplyTo(replyPreviewOf(m, senderName(m)));
        break;
      case 'copy':
        void copyText(m.body);
        break;
      case 'delete_me':
        void deleteMessage(m.id, 'me').then(flash);
        break;
      case 'delete_everyone':
        void deleteMessage(m.id, 'everyone').then(flash);
        break;
      case 'report': {
        const who = isGroup ? lookup(m.senderId) : null;
        router.push(
          reportHref({
            userId: m.senderId,
            username: peer?.username,
            name: who?.name ?? peer?.displayName,
            conversationId,
            messageId: m.id,
          }) as Href,
        );
        break;
      }
    }
  };

  const onMenuReact = (key: ReactionKey) => {
    const m = menu;
    setMenu(null);
    if (m) void react(m.id, key).then(flash);
  };

  const minutesLeft = menu
    ? Math.max(
        1,
        Math.ceil((DELETE_WINDOW_MS - (Date.now() - Date.parse(menu.createdAt))) / 60_000),
      )
    : undefined;

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
      <Pressable
        accessibilityRole={isBot ? 'header' : 'button'}
        accessibilityLabel={
          isGroup
            ? `${name}, ${memberCountLabel(summary?.group?.memberCount ?? 0)}. Group info`
            : isBot
              ? `${name}, practice bot`
              : `${name}, chat info`
        }
        disabled={isBot || !summary}
        onPress={() =>
          router.push(
            (isGroup ? `/group-info/${conversationId}` : `/chat-info/${conversationId}`) as Href,
          )
        }
        style={styles.title}
      >
        {summary?.kind === 'group' ? (
          <GroupAvatar members={summary.group.members} title={name} size={40} />
        ) : summary?.kind === 'bot' ? (
          <BotTile color={summary.bot.color} size={38} />
        ) : (
          <UserAvatar avatar={peer?.avatar} name={name} size={38} />
        )}
        <Text variant="callout" numberOfLines={1}>
          {name}
        </Text>
        <Text
          variant="footnote"
          color={typing ? 'accent' : 'sub'}
          numberOfLines={1}
          accessibilityLiveRegion="polite"
        >
          {typing
            ? isGroup
              ? 'Someone is typing…'
              : 'typing…'
            : summary?.kind === 'group'
              ? memberCountLabel(summary.group.memberCount)
              : summary?.kind === 'bot'
                ? 'Practice bot · Free'
                : peer
                  ? `@${peer.username}`
                  : ' '}
        </Text>
      </Pressable>
      <View style={styles.side}>
        {peer?.relationship === 'friends' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send Dyce Cash"
            onPress={() => router.push(`/wallet/send?to=${peer.id}` as Href)}
            style={styles.money}
          >
            <Text variant="headline" color="accent">
              Ð
            </Text>
          </Pressable>
        ) : null}
      </View>
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

  const renderItem = ({ item }: { item: ThreadItem }) => {
    if (item.kind === 'day') return <DaySeparator label={item.label} time={item.time} />;
    const m = item.message;
    const actions = summary
      ? availableActions(m, {
          myId,
          conversationKind: summary.kind,
          canAnswer: summary.state === 'active',
        })
      : [];
    return (
      <MessageBubble
        item={item}
        who={item.mine ? 'You' : senderName(m)}
        sender={isGroup && !item.mine && m.kind !== 'system' ? lookup(m.senderId) : null}
        myId={myId}
        receipt={receipt?.id === m.id ? receipt.label : null}
        onRetry={retry}
        onDiscard={discard}
        onOpenMenu={actions.length > 0 ? openMenu : undefined}
        onVote={(msg, optionId) => void vote(msg, optionId).then(flash)}
      />
    );
  };

  const quote = replyTo
    ? { ...replyTo, senderName: replyTo.senderId === myId ? 'yourself' : replyTo.senderName }
    : null;

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
      <View style={styles.requestActions}>
        <PillButton
          label="Report"
          accessibilityLabel={`Report @${peer?.username ?? ''}`}
          onPress={() =>
            router.push(
              reportHref({
                userId: peer?.id ?? '',
                username: peer?.username,
                name: peer?.displayName,
                conversationId,
              }) as Href,
            )
          }
        />
        <PillButton
          label="Block"
          accessibilityLabel={`Block @${peer?.username ?? ''}`}
          onPress={() => router.push(`/chat-info/${conversationId}` as Href)}
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
      {notice ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${notice}. Dismiss`}
          accessibilityLiveRegion="polite"
          onPress={() => setNotice(null)}
          style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.line }]}
        >
          <Text variant="footnote" color="accent">
            {notice}
          </Text>
        </Pressable>
      ) : null}
      {peer &&
      peer.relationship !== 'friends' &&
      !server.some((m) => m.senderId !== myId) &&
      server.length > 0 ? (
        <Text variant="footnote" color="sub" style={styles.note}>
          {name} isn&apos;t a friend yet, so this goes to their Requests until they reply.
        </Text>
      ) : null}
      <Composer
        onSend={(text) => {
          send(text, replyTo);
          setReplyTo(null);
        }}
        onTyping={isBot ? undefined : (on) => sendTypingSignal(conversationId, on)}
        // Games are played between friends (a stranger's chat is only a request); in a group the + opens them
        onOpenGames={
          peer?.relationship === 'friends'
            ? () => router.push(`/games?conversationId=${conversationId}` as Href)
            : undefined
        }
        onPlus={isGroup ? () => setPlus(true) : undefined}
        replyTo={quote}
        onCancelReply={() => setReplyTo(null)}
        placeholder={
          isGroup
            ? 'Message the group'
            : isBot
              ? `Message ${name}`
              : peer
                ? `Message ${name}`
                : 'Dyce message'
        }
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

      {menu && menuActions.length > 0 ? (
        <MessageActionsSheet
          message={menu}
          actions={menuActions}
          current={myReaction(menu)}
          who={menu.senderId === myId ? 'your' : senderName(menu)}
          minutesLeft={minutesLeft}
          onReact={onMenuReact}
          onAction={onMenuAction}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {plus ? (
        <ThreadPlusSheet
          onClose={() => setPlus(false)}
          onPoll={() => {
            setPlus(false);
            router.push(`/c/poll?conversationId=${conversationId}` as Href);
          }}
          onSpace={() => {
            setPlus(false);
            router.push('/space/new' as Href);
          }}
        />
      ) : null}
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
  money: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { alignItems: 'center', gap: 2, flex: 1 },
  list: { paddingHorizontal: 14, paddingVertical: 10 },
  more: { padding: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  centerText: { textAlign: 'center' },
  note: { textAlign: 'center', paddingHorizontal: 20, paddingTop: 6 },
  notice: {
    marginHorizontal: 14,
    marginBottom: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
  },
  request: { padding: 14, gap: 12, borderTopWidth: 1 },
  requestActions: { flexDirection: 'row', gap: 8 },
});
