import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { ReactionCount, ReplyPreview } from '@dyce/shared';
import { REACTIONS } from '@dyce/shared';
import { Text, brand, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { PillButton } from '@/components/PillButton';
import { clockTime, type Sender, type ThreadItem, type ThreadMessage } from '../chat-logic';
import { GameCard } from '@/features/games/components/GameCard';
import { MoneyCard } from './MoneyCard';
import { PollCard } from './PollCard';

type MessageItem = Extract<ThreadItem, { kind: 'message' }>;

/** "Today 4:30 PM", centred above the first message of each day. */
export function DaySeparator({ label, time }: { label: string; time: string }) {
  return (
    <View style={styles.day} accessibilityRole="header">
      <Text variant="footnote" color="sub">
        <Text variant="footnote" color="sub" style={styles.bold}>
          {label}
        </Text>{' '}
        {time}
      </Text>
    </View>
  );
}

/** The short text on a reaction chip ("GG", "HA", "!!", "?", "L"). */
const reactionLabel = (key: ReactionCount['key']) =>
  REACTIONS.find((r) => r.key === key)?.label ?? key;
const reactionWords = (key: ReactionCount['key']) =>
  REACTIONS.find((r) => r.key === key)?.aria ?? key;

/**
 * One message. Yours are ember on the right, theirs neutral on the left; runs from one person tighten up,
 * with the loose corner on the top and the tail on the bottom. In a group, theirs carry the sender's name
 * above the first of a run and their avatar beside the last. A reply quotes the message it answers; reactions
 * sit on the corner of the bubble; a message deleted for everyone leaves "This message was deleted". Under
 * your latest message sits its state (Sending… / Not sent / Sent / Read). Long-press (or right-click on web)
 * opens the message menu.
 */
export function MessageBubble({
  item,
  who,
  sender,
  myId,
  receipt,
  onRetry,
  onDiscard,
  onOpenMenu,
  onVote,
}: {
  item: MessageItem;
  /** Name for screen readers: "Amaka" or "You". */
  who: string;
  /** Set in a group, for messages from other people. */
  sender?: Sender | null;
  /** You, so a quote of your own message says "You". */
  myId?: string | null;
  receipt?: string | null;
  onRetry: (m: ThreadMessage) => void;
  onDiscard: (id: string) => void;
  /** Opens the message menu (long-press). Omitted when there is nothing to offer. */
  onOpenMenu?: (m: ThreadMessage) => void;
  onVote?: (m: ThreadMessage, optionId: number | null) => void;
}) {
  const { colors } = useTheme();
  const { message, mine, first, last } = item;
  const failed = message.status === 'failed';
  const bg = mine ? brand.ember.fill : colors.chip;
  const fg = mine ? brand.ember.text : colors.text;

  if (message.kind === 'system') {
    return (
      <View style={styles.system} accessibilityRole="text">
        <Text variant="footnote" color="sub" style={styles.systemText}>
          {message.body}
        </Text>
      </View>
    );
  }

  const open = onOpenMenu ? () => onOpenMenu(message) : undefined;
  const reactions = message.reactions ?? [];
  const reactionSummary = reactions.length
    ? `. Reactions: ${reactions.map((r) => `${reactionWords(r.key)} ${r.count}`).join(', ')}`
    : '';
  const quoted = message.replyTo
    ? `. In reply to ${message.replyTo.senderId === myId ? 'you' : message.replyTo.senderName}: ${message.replyTo.deleted ? 'deleted message' : message.replyTo.snippet}`
    : '';
  const isPoll = message.kind === 'poll' && !message.deleted;
  const showName = !!sender && !mine && first && !isPoll;

  const body = message.deleted ? (
    <View
      accessible
      accessibilityLabel={`${who}: this message was deleted, ${clockTime(message.createdAt)}`}
      style={[styles.bubble, styles.deleted, { borderColor: colors.line }]}
    >
      <Text color="sub" style={styles.deletedText}>
        This message was deleted
      </Text>
    </View>
  ) : message.kind === 'game' ? (
    <GameCard message={message} />
  ) : message.kind === 'money_sent' || message.kind === 'money_request' ? (
    <MoneyCard message={message} mine={mine} who={who} />
  ) : message.kind === 'poll' ? (
    <PollCard
      message={message}
      asker={mine ? 'You asked' : `${sender?.name ?? who} asked`}
      onVote={onVote ? (id) => onVote(message, id) : undefined}
    />
  ) : (
    <View
      accessible
      accessibilityLabel={`${who}: ${message.body}, ${clockTime(message.createdAt)}${quoted}${reactionSummary}`}
      style={[
        styles.bubble,
        { backgroundColor: bg, opacity: message.status === 'sending' ? 0.7 : 1 },
        mine
          ? { borderBottomRightRadius: last ? 6 : 20 }
          : { borderBottomLeftRadius: last ? 6 : 20 },
        mine ? { borderTopRightRadius: first ? 20 : 8 } : { borderTopLeftRadius: first ? 20 : 8 },
        failed ? { borderWidth: 1.5, borderColor: colors.accent } : null,
      ]}
    >
      {message.replyTo ? <Quote reply={message.replyTo} mine={mine} myId={myId} /> : null}
      <Text selectable style={[styles.text, { color: fg }]}>
        {message.body}
      </Text>
    </View>
  );

  // long-press for touch, right-click on web, and the "Message options" action for screen readers
  const gestures = open
    ? ({
        onLongPress: open,
        delayLongPress: 350,
        accessibilityActions: [{ name: 'longpress', label: 'Message options' }],
        onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
          if (e.nativeEvent.actionName === 'longpress') open();
        },
        ...(Platform.OS === 'web'
          ? {
              onContextMenu: (e: { preventDefault?: () => void }) => {
                e.preventDefault?.();
                open();
              },
            }
          : {}),
      } as object)
    : {};

  return (
    <View
      style={[
        styles.line,
        mine ? styles.lineMine : styles.lineTheirs,
        { marginTop: first ? 8 : 2 },
        isPoll ? styles.wide : null,
      ]}
    >
      {sender && !mine && !isPoll ? (
        <View style={styles.avatarCol} aria-hidden>
          {last ? <UserAvatar avatar={sender.avatar} name={sender.name} size={28} /> : null}
        </View>
      ) : null}
      <View
        style={[styles.col, mine ? styles.colMine : styles.colTheirs, isPoll ? styles.wide : null]}
      >
        {showName ? (
          <Text variant="footnote" color="sub" style={styles.name} numberOfLines={1}>
            {sender.name}
          </Text>
        ) : null}
        <Pressable
          {...gestures}
          accessible={false}
          style={[
            mine ? styles.colMine : styles.colTheirs,
            isPoll ? styles.wide : null,
            reactions.length > 0 ? { paddingTop: 10 } : null,
          ]}
        >
          {body}
          {reactions.length > 0 ? <Chips reactions={reactions} mine={mine} /> : null}
        </Pressable>

        {failed ? (
          <View style={styles.failed} accessibilityLiveRegion="polite">
            <Text variant="footnote" color="accent" style={styles.failedText}>
              Not sent. {message.error}
            </Text>
            <View style={styles.actions}>
              {message.retryable !== false ? (
                <PillButton label="Retry" tone="primary" onPress={() => onRetry(message)} />
              ) : null}
              <PillButton label="Delete" onPress={() => onDiscard(message.id)} />
            </View>
          </View>
        ) : receipt ? (
          <Text variant="footnote" color="sub" style={styles.receipt}>
            {receipt}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The quoted message at the top of a reply bubble. */
function Quote({
  reply,
  mine,
  myId,
}: {
  reply: ReplyPreview;
  mine: boolean;
  myId?: string | null;
}) {
  const { colors } = useTheme();
  return (
    <View
      aria-hidden
      style={[
        styles.quote,
        {
          backgroundColor: mine ? 'rgba(0,0,0,0.18)' : colors.bg2,
          borderLeftColor: mine ? 'rgba(255,255,255,0.75)' : colors.accent,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.quoteName, { color: mine ? brand.ember.text : colors.accent }]}
      >
        {reply.senderId === myId ? 'You' : reply.senderName}
      </Text>
      <Text
        numberOfLines={2}
        style={[
          styles.quoteText,
          { color: mine ? brand.ember.text : colors.sub, opacity: mine ? 0.9 : 1 },
          reply.deleted ? styles.italic : null,
        ]}
      >
        {reply.deleted ? 'This message was deleted' : reply.snippet}
      </Text>
    </View>
  );
}

/** Reactions on the top corner of the bubble: "GG", or "GG 2" when more than one person used it. */
function Chips({ reactions, mine }: { reactions: ReactionCount[]; mine: boolean }) {
  const { colors } = useTheme();
  return (
    <View aria-hidden style={[styles.chips, mine ? { left: -10 } : { right: -10 }]}>
      {reactions.map((r) => (
        <View
          key={r.key}
          style={[
            styles.chip,
            {
              backgroundColor: r.mine ? brand.ember.fill : colors.chip,
              borderColor: colors.bg,
            },
          ]}
        >
          <Text style={[styles.chipText, { color: r.mine ? brand.ember.text : colors.text }]}>
            {reactionLabel(r.key)}
            {r.count > 1 ? ` ${r.count}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  day: { alignItems: 'center', paddingVertical: 12 },
  bold: { fontFamily: 'Figtree_700Bold' },
  system: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 24 },
  systemText: { textAlign: 'center' },
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, maxWidth: '84%' },
  col: { flexShrink: 1, maxWidth: '100%' },
  wide: { alignSelf: 'stretch', maxWidth: '100%', width: '100%' },
  lineMine: { alignSelf: 'flex-end' },
  lineTheirs: { alignSelf: 'flex-start' },
  colMine: { alignItems: 'flex-end' },
  colTheirs: { alignItems: 'flex-start' },
  avatarCol: { width: 28, height: 28 },
  name: { marginLeft: 12, marginBottom: 2, maxWidth: 220 },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  deleted: { borderWidth: 1, borderStyle: 'dashed' },
  deletedText: { fontSize: 15, fontStyle: 'italic', fontFamily: 'Figtree_500Medium' },
  text: { fontSize: 16, lineHeight: 22, fontFamily: 'Figtree_500Medium' },
  quote: {
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
  },
  quoteName: { fontSize: 12, fontFamily: 'Figtree_700Bold' },
  quoteText: { fontSize: 13, lineHeight: 17, fontFamily: 'Figtree_500Medium' },
  italic: { fontStyle: 'italic' },
  chips: { position: 'absolute', top: -2, flexDirection: 'row', gap: 4 },
  chip: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 11, fontFamily: 'Figtree_800ExtraBold' },
  receipt: { marginTop: 2, marginRight: 4 },
  failed: { alignItems: 'flex-end', gap: 6, marginTop: 4 },
  failedText: { textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 8 },
});
