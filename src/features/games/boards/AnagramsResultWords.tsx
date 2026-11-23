import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@dyce/ui';
import type { ResultExtrasProps } from '../registry/types';
import { byPoints, missedWords, pointsLabel, type AnagramsView } from './anagrams-logic';

/**
 * Under the winner on the results screen: each player's words (both lists are visible once the match is
 * over), the number of words the six letters could make, and what you missed. Follows the device theme.
 */
export function AnagramsResultWords({ view, myId, nameOf }: ResultExtrasProps<AnagramsView>) {
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
      {view.letters ? (
        <Text
          variant="footnote"
          color="sub"
          accessibilityLabel={`The letters were ${view.letters.join(', ')}`}
        >
          Letters: {view.letters.join(' ')}
        </Text>
      ) : null}
      {order.map((id) => {
        const words = byPoints(view.words[id] ?? []);
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
          The letters made {view.possibleWords} words
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
