import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ConversationSummary } from '@dyce/shared';
import { ModeBadge, Text, brand, useTheme } from '@dyce/ui';
import { InitialAvatar } from '@/components/InitialAvatar';
import { listTime, previewText } from '../chat-logic';

/**
 * One row of the Chat list: avatar, name, last message, time, and an unread count. In Requests it also
 * carries a REQUEST tag and, underneath, the Accept / Decline actions.
 */
export function ConversationRow({
  conversation,
  myId,
  onPress,
  actions,
}: {
  conversation: ConversationSummary;
  myId: string | null;
  onPress: () => void;
  /** Buttons shown under the row (Requests). */
  actions?: ReactNode;
}) {
  const { colors } = useTheme();
  const { peer, unread, lastMessage, state } = conversation;
  const name = peer.displayName || peer.username;
  const preview = previewText(conversation, myId);
  const time = lastMessage ? listTime(lastMessage.createdAt) : '';

  return (
    <View style={[styles.wrap, { borderColor: colors.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}${state === 'request' ? ', request' : ''}${
          unread > 0 ? `, ${unread} unread` : ''
        }. ${preview}${time ? `, ${time}` : ''}`}
        onPress={onPress}
        style={styles.row}
      >
        <InitialAvatar name={name} size={52} />
        <View style={styles.body}>
          <View style={styles.line}>
            <Text variant="callout" numberOfLines={1} style={styles.grow}>
              {name}
            </Text>
            {state === 'request' ? <ModeBadge kind="REQUEST" /> : null}
            <Text variant="footnote" color={unread > 0 ? 'accent' : 'sub'}>
              {time}
            </Text>
          </View>
          <View style={styles.line}>
            <Text
              variant={unread > 0 ? 'callout' : 'body'}
              color={unread > 0 ? 'text' : 'sub'}
              numberOfLines={1}
              style={styles.grow}
            >
              {preview}
            </Text>
            {unread > 0 ? (
              <View style={styles.badge} aria-hidden>
                <Text variant="caption" style={{ color: brand.ember.text }}>
                  {unread > 99 ? '99+' : unread}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingVertical: 10 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: brand.ember.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 8, paddingLeft: 64, paddingBottom: 12 },
});
