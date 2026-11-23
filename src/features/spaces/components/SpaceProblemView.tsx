import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import type { SpaceProblemCopy } from '../space-problem-logic';

/**
 * A space you cannot be in (design: RoomFull, RoomHostLeft, RoomRemoved): a big glyph tile, what happened, what
 * happened to your money, and where to go next. The same screen for all of them; the words come from
 * `spaceProblem`.
 */
export function SpaceProblemView({
  problem,
  title,
  onPrimary,
  onSecondary,
  secondaryLabel,
}: {
  problem: SpaceProblemCopy;
  /** The space's name, shown at the top when known. */
  title?: string | null;
  onPrimary: () => void;
  onSecondary?: () => void;
  secondaryLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      {title ? (
        <Text variant="callout" style={styles.header} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={styles.middle} accessibilityRole="alert">
        <View style={[styles.tile, { backgroundColor: problem.tile }]} accessibilityElementsHidden>
          <Text variant="title" color="#FFFFFF">
            {problem.glyph}
          </Text>
        </View>
        <Text variant="title" style={styles.center} accessibilityRole="header">
          {problem.title}
        </Text>
        <Text color="sub" style={[styles.center, styles.body]}>
          {problem.body}
        </Text>
        {problem.money ? (
          <View style={[styles.money, { backgroundColor: colors.moneySoft }]}>
            <Text variant="footnote" color="money">
              {problem.money}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        <TokenButton label={problem.cta} onPress={onPrimary} />
        {onSecondary && secondaryLabel ? (
          <TokenButton label={secondaryLabel} tone="chip" onPress={onSecondary} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { textAlign: 'center', paddingVertical: 14, paddingHorizontal: 20 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  tile: { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22 },
  money: { marginTop: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
  actions: { padding: 20, gap: 10, maxWidth: 520, width: '100%', alignSelf: 'center' },
});
