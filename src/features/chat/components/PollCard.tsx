import { Pressable, StyleSheet, View } from 'react-native';
import type { Message } from '@dyce/shared';
import { Icon, Text, brand, useTheme } from '@dyce/ui';
import { pollPercent } from '../chat-logic';

type PollMessage = Extract<Message, { kind: 'poll' }>;

/**
 * A poll in a group (design: GroupChat). The question, then one row per option with a bar showing its share
 * and the number of votes. One vote each: tap an option to vote, tap another to change it, tap yours again to
 * take it back. Your pick has an ember ring and a check, so colour is never the only signal.
 */
export function PollCard({
  message,
  asker,
  onVote,
}: {
  message: PollMessage;
  /** "Tunde asked" / "You asked". */
  asker: string;
  onVote?: (optionId: number | null) => void;
}) {
  const { colors } = useTheme();
  const { question, options, total, myVote } = message.payload;
  return (
    <View
      accessible={false}
      style={[styles.card, { backgroundColor: colors.bg2, borderColor: colors.line }]}
    >
      <Text style={[styles.kicker, { color: colors.sub }]}>POLL · {asker}</Text>
      <Text accessibilityRole="header" style={styles.question}>
        {question}
      </Text>
      {options.map((o) => {
        const selected = myVote === o.id;
        const pct = pollPercent(o.votes, total);
        return (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityLabel={`${o.text}, ${o.votes} ${o.votes === 1 ? 'vote' : 'votes'}${
              selected ? ', your vote. Tap to take it back' : ''
            }`}
            accessibilityState={{ selected }}
            disabled={!onVote}
            onPress={() => onVote?.(selected ? null : o.id)}
            style={[
              styles.option,
              {
                backgroundColor: colors.bg,
                borderColor: selected ? brand.ember.fill : 'transparent',
              },
            ]}
          >
            <View
              aria-hidden
              style={[styles.bar, { width: `${pct}%`, backgroundColor: colors.brandSoft }]}
            />
            <Text numberOfLines={2} style={styles.optionText}>
              {o.text}
            </Text>
            {selected ? <Icon name="check" size={16} color={brand.ember.fill} /> : null}
            <Text style={styles.votes}>{o.votes}</Text>
          </Pressable>
        );
      })}
      <Text style={[styles.total, { color: colors.sub }]}>
        {total} {total === 1 ? 'vote' : 'votes'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 6, alignSelf: 'stretch' },
  kicker: { fontSize: 12, fontFamily: 'Figtree_700Bold' },
  question: { fontSize: 16, fontFamily: 'Figtree_700Bold', marginBottom: 4 },
  option: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  optionText: { flex: 1, fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  votes: { fontSize: 14, fontFamily: 'Figtree_800ExtraBold' },
  total: { fontSize: 12, fontFamily: 'Figtree_600SemiBold', marginTop: 2 },
});
