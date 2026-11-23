import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@dyce/ui';

/**
 * What the + next to a group's composer offers: a poll ("What are we playing tonight?") and starting a
 * Space (SPEC §6: "start a Space from the group"). A Space made here is an ordinary Space; its code and link
 * are shared into the group from there (a Space card inside the thread is in the BACKLOG).
 */
export function ThreadPlusSheet({
  onPoll,
  onSpace,
  onClose,
}: {
  onPoll: () => void;
  onSpace: () => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const rows = [
    { label: 'Poll', detail: 'Ask the group a question', onPress: onPoll },
    { label: 'Start a Space', detail: 'Play a game together', onPress: onSpace },
  ];
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={[styles.scrim, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)' }]}
      />
      <View pointerEvents="box-none" style={styles.stage}>
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}
        >
          {rows.map((r, i) => (
            <Pressable
              key={r.label}
              accessibilityRole="button"
              accessibilityLabel={`${r.label}. ${r.detail}`}
              onPress={r.onPress}
              style={[styles.row, i > 0 ? { borderTopWidth: 1, borderColor: colors.line } : null]}
            >
              <Text style={styles.label}>{r.label}</Text>
              <Text color="sub" style={styles.detail}>
                {r.detail}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill },
  stage: { flex: 1, justifyContent: 'flex-end', padding: 14 },
  sheet: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  row: { minHeight: 64, paddingHorizontal: 18, justifyContent: 'center', gap: 2 },
  label: { fontSize: 16, fontFamily: 'Figtree_700Bold' },
  detail: { fontSize: 13 },
});
