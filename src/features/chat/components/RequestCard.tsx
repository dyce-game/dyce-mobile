import { Pressable, StyleSheet, View } from 'react-native';
import type { ConversationSummary } from '@dyce/shared';
import { Icon, Text, brand, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { listTime } from '../chat-logic';

/**
 * A message request (design: Chats, Requests view): who it's from, what they said, and Accept / Decline plus a
 * round button that opens their Chat info, where Report and Block are. Nothing here tells them whether you've
 * looked. The design's game-invite panel becomes the message itself until games can be sent.
 */
export function RequestCard({
  conversation,
  onOpen,
  onAccept,
  onDecline,
  onSafety,
  accepting,
  declining,
}: {
  conversation: ConversationSummary;
  onOpen: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onSafety: () => void;
  accepting?: boolean;
  declining?: boolean;
}) {
  const { colors } = useTheme();
  const { peer, lastMessage, unread } = conversation;
  const handle = `@${peer.username}`;
  const name = peer.displayName && peer.displayName !== peer.username ? peer.displayName : null;
  const busy = accepting || declining;
  const note = lastMessage ? lastMessage.body.replace(/\s+/g, ' ').trim() : 'No message yet';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.line,
          boxShadow: `0px 6px 18px ${colors.glassShadow}`,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${handle}, message request${unread > 1 ? `, ${unread} messages` : ''}. ${note}`}
        onPress={onOpen}
      >
        <View style={styles.head}>
          <UserAvatar avatar={peer.avatar} name={name ?? peer.username} size={42} />
          <View style={styles.who}>
            <Text numberOfLines={1} style={styles.handle}>
              {handle}
            </Text>
            <Text numberOfLines={1} style={styles.meta} color="sub">
              {name ? `${name} · ` : ''}Not a friend yet
            </Text>
          </View>
          {lastMessage ? (
            <Text style={styles.time} color="sub">
              {listTime(lastMessage.createdAt)}
            </Text>
          ) : null}
        </View>
        <View style={[styles.panel, { backgroundColor: colors.chip }]}>
          <View style={[styles.tile, { backgroundColor: brand.ember.fill }]} aria-hidden>
            <Icon name="chat" size={22} color={brand.ember.text} />
          </View>
          <View style={styles.who}>
            <Text style={styles.panelTitle}>{unread > 1 ? `${unread} messages` : 'Message'}</Text>
            <Text numberOfLines={2} style={styles.meta} color="sub">
              “{note}”
            </Text>
          </View>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Accept chat with ${handle}`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onAccept}
          style={[
            styles.accept,
            { backgroundColor: brand.ember.fill, boxShadow: `0px 3px 0px ${brand.ember.edge}` },
          ]}
        >
          <Text style={styles.acceptText}>{accepting ? '…' : 'Accept'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decline chat from ${handle}`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onDecline}
          style={[styles.decline, { backgroundColor: colors.chip }]}
        >
          <Text style={styles.declineText}>{declining ? '…' : 'Decline'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Report or block ${handle}`}
          onPress={onSafety}
          style={[styles.round, { backgroundColor: colors.chip }]}
        >
          <Icon name="block" size={18} color={colors.sub} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  who: { flex: 1, minWidth: 0 },
  handle: { fontSize: 15, fontFamily: 'Figtree_800ExtraBold' },
  meta: { fontSize: 12, fontFamily: 'Figtree_500Medium' },
  time: { fontSize: 12, fontFamily: 'Figtree_600SemiBold' },
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginTop: 10,
    padding: 10,
    borderRadius: 16,
  },
  tile: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { fontSize: 15, fontFamily: 'Figtree_800ExtraBold' },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 15,
  },
  accept: {
    flex: 1.4,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: { color: brand.ember.text, fontSize: 14, fontFamily: 'Figtree_800ExtraBold' },
  decline: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
