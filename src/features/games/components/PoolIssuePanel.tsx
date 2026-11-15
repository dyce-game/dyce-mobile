import { Pressable, StyleSheet, View } from 'react-native';
import { Text, brand, useTheme } from '@dyce/ui';

export type PoolIssueOption = {
  title: string;
  sub: string;
  /** "primary" is the ember call to action, "free" the green one, "quiet" the plain card. */
  tone: 'primary' | 'free' | 'quiet';
  onPress: () => void;
  busy?: boolean;
};

export type PoolIssueProps = {
  /** "₦" (low balance) or "!" (limit): a glyph in a coloured disc, as in the design. */
  glyph: '₦' | '!';
  title: string;
  sub: string;
  /** The two figures under the title and the bar between them: "Your balance ₦650" ... "Needed ₦1,000". */
  left: { label: string; value: string };
  right: { label: string; value: string };
  /** 0 to 1: how full the bar is. */
  fill: number;
  options: PoolIssueOption[];
  foot: string;
};

/**
 * Why a stake was refused, in plain words, with ways forward (design: PoolIssues): not enough Dyce Cash, or the
 * daily Pool limit. Used on the mode sheet (you are sending) and after tapping Accept (you are answering).
 */
export function PoolIssuePanel({
  glyph,
  title,
  sub,
  left,
  right,
  fill,
  options,
  foot,
}: PoolIssueProps) {
  const { colors } = useTheme();
  const disc = glyph === '₦' ? '#C2410C' : '#B33416';
  const pct = `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%` as `${number}%`;
  return (
    <View style={styles.root} accessibilityLiveRegion="polite">
      <View style={[styles.disc, { backgroundColor: disc }]} accessibilityElementsHidden>
        <Text variant="title" style={styles.glyph}>
          {glyph}
        </Text>
      </View>
      <Text variant="title" accessibilityRole="header" style={styles.center}>
        {title}
      </Text>
      <Text color="sub" style={styles.center}>
        {sub}
      </Text>

      <View
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}
        accessible
        accessibilityLabel={`${left.label} ${left.value}. ${right.label} ${right.value}.`}
      >
        <View style={styles.figures}>
          <View>
            <Text variant="footnote" color="sub">
              {left.label}
            </Text>
            <Text variant="headline">{left.value}</Text>
          </View>
          <View style={styles.alignEnd}>
            <Text variant="footnote" color="sub">
              {right.label}
            </Text>
            <Text variant="headline">{right.value}</Text>
          </View>
        </View>
        <View style={[styles.track, { backgroundColor: colors.line }]}>
          <View style={[styles.fill, { width: pct, backgroundColor: brand.ember.fill }]} />
        </View>
      </View>

      <View style={styles.options}>
        {options.map((o) => {
          const palette =
            o.tone === 'primary'
              ? { bg: brand.ember.fill, fg: '#FFFFFF', sub: '#FFFFFFCC', border: 'transparent' }
              : o.tone === 'free'
                ? { bg: colors.moneySoft, fg: '#08402A', sub: '#08402ACC', border: 'transparent' }
                : { bg: colors.card, fg: colors.text, sub: colors.sub, border: colors.line };
          return (
            <Pressable
              key={o.title}
              accessibilityRole="button"
              accessibilityLabel={`${o.title}. ${o.sub}`}
              accessibilityState={{ disabled: !!o.busy, busy: !!o.busy }}
              disabled={o.busy}
              onPress={o.onPress}
              style={[styles.option, { backgroundColor: palette.bg, borderColor: palette.border }]}
            >
              <Text variant="headline" style={{ color: palette.fg }}>
                {o.busy ? 'One moment…' : o.title}
              </Text>
              <Text variant="footnote" style={{ color: palette.sub }}>
                {o.sub}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="footnote" color="sub" style={styles.center}>
        {foot}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'stretch' },
  disc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { color: '#FFFFFF' },
  center: { textAlign: 'center' },
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  figures: { flexDirection: 'row', justifyContent: 'space-between' },
  alignEnd: { alignItems: 'flex-end' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  options: { gap: 10 },
  option: {
    minHeight: 56,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 2,
  },
});
