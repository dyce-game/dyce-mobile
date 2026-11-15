import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@dyce/ui';
import type { WordHuntView } from '../games-logic';
import { missedWords, pointsLabel } from './word-hunt-logic';

/**
 * Under the winner on the results screen: each player's words (both lists are visible once the match is
 * over), and how many words the grid held. Follows the device theme, unlike the play table.
 */
export function WordHuntResultWords({
  view,
  myId,
  nameOf,
}: {
  view: WordHuntView;
  myId: string | null;
  nameOf: (id: string) => string;
}) {
  const { colors } = useTheme();
  const order = [...view.players].sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0));
  const mine = (myId ? view.words[myId] : null) ?? [];
  const theirs = order.filter((id) => id !== myId).flatMap((id) => view.words[id] ?? []);
  const missed = missedWords(mine, theirs);

  return (
    <ScrollView
      style={[styles.box, { backgroundColor: colors.card, borderColor: colors.line }]}
      contentContainerStyle={styles.content}
    >
      {order.map((id) => {
        const words = view.words[id] ?? [];
        const name = id === myId ? 'You' : nameOf(id);
        return (
          <View key={id} style={styles.group}>
            <Text
              variant="callout"
              accessibilityLabel={`${name}: ${view.scores[id] ?? 0} points, ${words.length} words`}
            >
              {name} · {pointsLabel(view.scores[id] ?? 0)} · {words.length}{' '}
              {words.length === 1 ? 'word' : 'words'}
            </Text>
            <View
              style={styles.chips}
              accessible
              accessibilityLabel={`${name}'s words: ${words.join(', ') || 'none'}`}
            >
              {words.map((w) => (
                <View key={w} style={[styles.chip, { backgroundColor: colors.chip }]}>
                  <Text variant="caption" style={styles.word}>
                    {w}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
      {view.possibleWords !== null ? (
        <Text variant="footnote" color="sub">
          The grid held {view.possibleWords} words
          {missed.length > 0 ? `. You missed ${missed.length} that they found.` : '.'}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', maxHeight: 260, borderRadius: 20, borderWidth: 1, marginTop: 6 },
  content: { padding: 14, gap: 12 },
  group: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 26, paddingHorizontal: 10, borderRadius: 13, justifyContent: 'center' },
  word: { textTransform: 'none', letterSpacing: 0.6 },
});
