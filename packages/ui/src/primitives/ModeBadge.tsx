import { StyleSheet, View } from 'react-native';
import { Text } from './Text.tsx';
import { useTheme } from '../theme.tsx';
import { brand } from '../tokens.ts';

export type ModeBadgeKind = 'FREE' | 'POOL' | 'SPACE' | 'YOUR TURN' | 'SMS' | 'BOT' | 'REQUEST';

/**
 * Mode badges always carry text: colour is never the only signal (CLAUDE.md accessibility rule).
 */
export function ModeBadge({ kind }: { kind: ModeBadgeKind }) {
  const { colors } = useTheme();
  const p =
    kind === 'FREE'
      ? brand.felt
      : kind === 'POOL'
        ? brand.ember
        : kind === 'YOUR TURN'
          ? brand.brass
          : kind === 'SMS'
            ? brand.sms
            : kind === 'BOT'
              ? brand.bot
              : kind === 'SPACE'
                ? { fill: colors.brandSoft, text: colors.accent }
                : { fill: colors.chip, text: colors.sub }; // REQUEST
  return (
    <View
      style={[styles.badge, { backgroundColor: p.fill }]}
      accessible
      accessibilityLabel={`${kind} mode`}
    >
      <Text variant="caption" style={{ color: p.text }}>
        {kind}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
});
