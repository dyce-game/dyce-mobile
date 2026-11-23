import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@dyce/ui';
import { poolRulesLine, rulesFor } from '../registry';

/**
 * How to play: three bullets and the Pool rules line, from the game's rules copy (docs/GAMES.md). Used in the
 * mode sheet, from a drawer tile, and on the "coming soon" screen. `poolMinKobo` is the server's minimum when
 * the game came from the catalogue, so the line always agrees with what the server will accept.
 */
export function RulesSheet({
  slug,
  poolMinKobo,
  showPool = true,
}: {
  slug: string;
  poolMinKobo?: number | null;
  showPool?: boolean;
}) {
  const { colors } = useTheme();
  const rules = rulesFor(slug);
  if (!rules) return null;
  return (
    <View style={styles.root} accessibilityLabel="How to play">
      <Text variant="callout" accessibilityRole="header">
        How to play
      </Text>
      {rules.how.map((line, i) => (
        <View key={i} style={styles.row}>
          <Text variant="callout" color="sub" style={styles.num}>
            {i + 1}
          </Text>
          <Text variant="footnote" style={styles.line}>
            {line}
          </Text>
        </View>
      ))}
      {showPool && rules.poolMinKobo !== null ? (
        <View style={[styles.pool, { backgroundColor: colors.bg2, borderColor: colors.line }]}>
          <Text variant="footnote" color="sub">
            {`Pool: ${poolRulesLine(rules, poolMinKobo)}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8, alignSelf: 'stretch' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  num: { width: 18, textAlign: 'center' },
  line: { flex: 1 },
  pool: { borderRadius: 14, borderWidth: 1, padding: 10, marginTop: 4 },
});
