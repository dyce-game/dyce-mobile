import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { REACTIONS, type ReactionKey } from '@dyce/shared';
import { Text, brand, useTheme } from '@dyce/ui';
import { COPY_LABEL } from '@/lib/copy-text';
import type { MessageAction, ThreadMessage } from '../chat-logic';

/**
 * The long-press menu (design: MessageLongPress, MessageActions): a dimmed screen, a row of reactions, the
 * message itself, and a card of actions. Only what applies is listed (see `availableActions`): Forward and
 * "Turn into a challenge" from the design are left out until those exist. Closing is a tap anywhere outside,
 * the Back button, or the Close button for screen readers.
 */
export function MessageActionsSheet({
  message,
  actions,
  current,
  who,
  minutesLeft,
  onReact,
  onAction,
  onClose,
}: {
  message: ThreadMessage;
  actions: MessageAction[];
  /** The reaction you already gave it, if any. */
  current: ReactionKey | null;
  /** Whose message it is, for the spoken label. */
  who: string;
  /** Minutes left to delete it for everyone (shown beside that item). */
  minutesLeft?: number;
  onReact: (key: ReactionKey) => void;
  onAction: (action: Exclude<MessageAction, 'react'>) => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const preview =
    message.kind === 'text'
      ? message.body
      : message.kind === 'poll'
        ? `Poll: ${message.payload.question}`
        : message.body || 'Message';

  const items: {
    key: Exclude<MessageAction, 'react'>;
    label: string;
    hint?: string;
    danger?: boolean;
  }[] = [
    { key: 'reply', label: 'Reply' },
    { key: 'copy', label: COPY_LABEL },
    { key: 'delete_me', label: 'Delete for me', danger: true },
    {
      key: 'delete_everyone',
      label: 'Delete for everyone',
      hint: minutesLeft !== undefined ? `${minutesLeft} min left` : undefined,
      danger: true,
    },
    { key: 'report', label: 'Report', danger: true },
  ];

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        accessibilityLabel="Close message options"
        accessibilityRole="button"
        onPress={onClose}
        style={[
          styles.scrim,
          { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)' },
        ]}
      />
      <View pointerEvents="box-none" style={styles.stage}>
        <View
          accessibilityViewIsModal
          accessibilityLabel={`Message options for ${who}'s message`}
          style={styles.stack}
        >
          {actions.includes('react') ? (
            <View
              accessibilityRole="toolbar"
              accessibilityLabel="Reactions"
              style={[styles.reactions, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              {REACTIONS.map((r) => {
                const on = current === r.key;
                return (
                  <Pressable
                    key={r.key}
                    accessibilityRole="button"
                    accessibilityLabel={on ? `${r.aria}, selected. Tap to remove` : r.aria}
                    accessibilityState={{ selected: on }}
                    onPress={() => onReact(r.key)}
                    style={[
                      styles.react,
                      { backgroundColor: on ? brand.ember.fill : 'transparent' },
                    ]}
                  >
                    <Text
                      style={[styles.reactText, { color: on ? brand.ember.text : colors.text }]}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={[styles.preview, { backgroundColor: colors.chip }]}>
            <Text numberOfLines={4} style={styles.previewText}>
              {preview}
            </Text>
          </View>

          <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.line }]}>
            {items
              .filter((i) => actions.includes(i.key))
              .map((i, n, all) => (
                <Pressable
                  key={i.key}
                  accessibilityRole="button"
                  accessibilityLabel={i.hint ? `${i.label}, ${i.hint}` : i.label}
                  onPress={() => onAction(i.key)}
                  style={[
                    styles.item,
                    n < all.length - 1 ? { borderBottomWidth: 1, borderColor: colors.line } : null,
                  ]}
                >
                  <Text
                    style={[styles.itemText, { color: i.danger ? colors.danger : colors.text }]}
                  >
                    {i.label}
                  </Text>
                  {i.hint ? (
                    <Text color="sub" style={styles.hint}>
                      {i.hint}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={[styles.item, { borderTopWidth: 1, borderColor: colors.line }]}
            >
              <Text color="sub" style={styles.itemText}>
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  stack: { width: '100%', maxWidth: 340, gap: 12, alignItems: 'stretch' },
  reactions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 6,
    borderRadius: 30,
    borderWidth: 1,
  },
  react: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactText: { fontSize: 15, fontFamily: 'Figtree_800ExtraBold' },
  preview: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  previewText: { fontSize: 16, lineHeight: 22, fontFamily: 'Figtree_500Medium' },
  menu: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  item: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemText: { fontSize: 15, fontFamily: 'Figtree_500Medium' },
  hint: { fontSize: 13 },
});
