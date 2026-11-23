import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@dyce/ui';

export type StatRow = { label: string; mine: string; theirs: string };

/**
 * Under the winner on the results screen of a sports game: a small two-column table of the numbers that
 * settled it. Follows the device theme (the play table does not).
 */
export function ResultStats({
  myName,
  theirName,
  rows,
  note,
}: {
  myName: string;
  theirName: string;
  rows: StatRow[];
  note?: string | null;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.box, { backgroundColor: colors.card, borderColor: colors.line }]}
      accessible
      accessibilityLabel={`${rows
        .map((r) => `${r.label}: ${myName} ${r.mine}, ${theirName} ${r.theirs}`)
        .join('. ')}${note ? `. ${note}` : ''}`}
    >
      <View style={styles.row}>
        <Text variant="caption" color="sub" style={styles.label}>
          {' '}
        </Text>
        <Text variant="caption" color="sub" style={styles.cell} numberOfLines={1}>
          {myName}
        </Text>
        <Text variant="caption" color="sub" style={styles.cell} numberOfLines={1}>
          {theirName}
        </Text>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.row}>
          <Text variant="footnote" color="sub" style={styles.label}>
            {r.label}
          </Text>
          <Text variant="callout" style={styles.cell}>
            {r.mine}
          </Text>
          <Text variant="callout" style={styles.cell}>
            {r.theirs}
          </Text>
        </View>
      ))}
      {note ? (
        <Text variant="footnote" color="sub">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 6, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1.4 },
  cell: { flex: 1, textAlign: 'right' },
});
