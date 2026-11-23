import { Pressable, StyleSheet, View } from 'react-native';
import type { ConversationSummary } from '@dyce/shared';
import { Text, brand, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { listTime, previewText } from '../chat-logic';
import { BotTile, GroupAvatar, RowTag } from './ChatAvatars';

/** Who a row is about: its name, the picture, and (for bots) the tag. */
function identity(conversation: ConversationSummary) {
  switch (conversation.kind) {
    case 'group':
      return {
        name: conversation.group.title,
        kind: `Group, ${conversation.group.memberCount} people`,
      };
    case 'bot':
      return { name: conversation.bot.name, kind: 'Practice bot' };
    default:
      return {
        name: conversation.peer.displayName || conversation.peer.username,
        kind: '',
      };
  }
}

/**
 * One row of the Chat list (design: Chats): 78pt high, a 54pt avatar (a cluster for a group, a tile for a
 * bot), name and time on the first line, the last message on the second (bold and full-strength when unread)
 * with the unread count and a tag. Message requests are shown by `RequestCard`, not here.
 */
export function ConversationRow({
  conversation,
  myId,
  onPress,
}: {
  conversation: ConversationSummary;
  myId: string | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { unread, lastMessage } = conversation;
  const { name, kind } = identity(conversation);
  const preview = previewText(conversation, myId);
  const time = lastMessage ? listTime(lastMessage.createdAt) : '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}${kind ? `, ${kind}` : ''}${unread > 0 ? `, ${unread} unread` : ''}. ${preview}${
        time ? `, ${time}` : ''
      }`}
      onPress={onPress}
      style={styles.row}
    >
      {conversation.kind === 'group' ? (
        <GroupAvatar members={conversation.group.members} title={name} />
      ) : conversation.kind === 'bot' ? (
        <BotTile color={conversation.bot.color} />
      ) : (
        <UserAvatar avatar={conversation.peer.avatar} name={name} size={54} />
      )}
      <View style={styles.body}>
        <View style={styles.line}>
          <Text numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <Text style={styles.time} color="sub">
            {time}
          </Text>
        </View>
        <View style={styles.line}>
          <Text
            numberOfLines={1}
            style={[
              styles.preview,
              {
                color: unread > 0 ? colors.text : colors.sub,
                fontFamily: unread > 0 ? 'Figtree_700Bold' : 'Figtree_500Medium',
              },
            ]}
          >
            {preview}
          </Text>
          {conversation.kind === 'bot' ? (
            <RowTag label="BOT" background="#5A4FCF" edge="#3A30A0" />
          ) : null}
          {unread > 0 ? (
            <View style={styles.badge} aria-hidden>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: 78,
    paddingHorizontal: 18,
  },
  body: { flex: 1, minWidth: 0, gap: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, minWidth: 0, fontSize: 16, fontFamily: 'Figtree_700Bold' },
  time: { fontSize: 12, fontFamily: 'Figtree_600SemiBold' },
  preview: { flex: 1, minWidth: 0, fontSize: 14 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: brand.ember.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: brand.ember.text, fontSize: 11, fontFamily: 'Figtree_800ExtraBold' },
});
