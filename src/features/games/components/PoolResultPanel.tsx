import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@dyce/ui';
import type { PoolResult } from '../pool-logic';

/**
 * What a finished Pool game did to your wallet (design: PoolResult): the big figure (+Ð1,000, −Ð1,000, "Pot
 * split") and the lines under it: pot, stakes, fee, new balance. Every figure comes from the server's payouts.
 */
export function PoolResultPanel({ result }: { result: PoolResult }) {
  const { colors } = useTheme();
  const tone =
    result.outcome === 'won'
      ? colors.money
      : result.outcome === 'lost'
        ? colors.danger
        : colors.text;
  return (
    <View
      style={styles.root}
      accessible
      accessibilityLabel={result.spoken}
      accessibilityLiveRegion="polite"
    >
      <Text variant="title" style={[styles.amount, { color: tone }]}>
        {result.amount}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
        {result.lines.map((l) => (
          <View key={l.label} style={styles.row}>
            <Text variant="callout" color="sub">
              {l.label}
            </Text>
            <Text variant="callout">{l.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch', alignItems: 'center', gap: 12, maxWidth: 420 },
  amount: { textAlign: 'center' },
  card: { alignSelf: 'stretch', borderRadius: 20, borderWidth: 1, padding: 14, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
});
