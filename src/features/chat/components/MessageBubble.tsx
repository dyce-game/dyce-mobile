import { StyleSheet, View } from 'react-native';
import { Text, brand, useTheme } from '@dyce/ui';
import { PillButton } from '@/components/PillButton';
import { clockTime, type ThreadItem, type ThreadMessage } from '../chat-logic';
import { GameCard } from '@/features/games/components/GameCard';
import { MoneyCard } from './MoneyCard';

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

/**
 * One message. Yours are ember on the right, theirs neutral on the left; runs from one person tighten up,
 * with the loose corner on the top and the tail on the bottom. Under your latest message sits its state
 * (Sending… / Not sent / Sent / Read).
 */
export function MessageBubble({
  item,
  who,
  receipt,
  onRetry,
  onDiscard,
}: {
  item: MessageItem;
  /** Name for screen readers: "Amaka" or "You". */
  who: string;
  receipt?: string | null;
  onRetry: (m: ThreadMessage) => void;
  onDiscard: (id: string) => void;
}) {
  const { colors } = useTheme();
  const { message, mine, first, last } = item;
  const failed = message.status === 'failed';
  const bg = mine ? brand.ember.fill : colors.chip;
  const fg = mine ? brand.ember.text : colors.text;

  return (
    <View style={[styles.row, mine ? styles.mine : styles.theirs, { marginTop: first ? 8 : 2 }]}>
      {message.kind === 'game' ? (
        <GameCard message={message} />
      ) : message.kind !== 'text' ? (
        <MoneyCard message={message} mine={mine} who={who} />
      ) : (
        <View
          accessible
          accessibilityLabel={`${who}: ${message.body}, ${clockTime(message.createdAt)}`}
          style={[
            styles.bubble,
            { backgroundColor: bg, opacity: message.status === 'sending' ? 0.7 : 1 },
            mine
              ? { borderBottomRightRadius: last ? 6 : 20 }
              : { borderBottomLeftRadius: last ? 6 : 20 },
            mine
              ? { borderTopRightRadius: first ? 20 : 8 }
              : { borderTopLeftRadius: first ? 20 : 8 },
            failed ? { borderWidth: 1.5, borderColor: colors.accent } : null,
          ]}
        >
          <Text selectable style={[styles.text, { color: fg }]}>
            {message.body}
          </Text>
        </View>
      )}

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
  );
}

const styles = StyleSheet.create({
  day: { alignItems: 'center', paddingVertical: 12 },
  bold: { fontFamily: 'Figtree_700Bold' },
  row: { maxWidth: '78%' },
  mine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  text: { fontSize: 16, lineHeight: 22, fontFamily: 'Figtree_500Medium' },
  receipt: { marginTop: 2, marginRight: 4 },
  failed: { alignItems: 'flex-end', gap: 6, marginTop: 4 },
  failedText: { textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 8 },
});
