import { StyleSheet, View } from 'react-native';
import { Text } from './Text.tsx';
import { brand } from '../tokens.ts';

export type ModeBadgeKind = 'FREE' | 'POOL' | 'SPACE' | 'YOUR TURN' | 'SMS' | 'BOT' | 'REQUEST';

type Palette = { fill: string; text: string; edge: string };

/** Tag colours from the Chat design: text, fill and the solid 2pt bottom edge. */
const PALETTE: Record<ModeBadgeKind, Palette> = {
  POOL: brand.ember,
  'YOUR TURN': brand.brass,
  FREE: brand.felt,
  SPACE: { fill: '#1B140F', text: '#FFFFFF', edge: '#000000' },
  SMS: brand.sms,
  BOT: { fill: brand.bot.fill, text: brand.bot.text, edge: '#3A30A0' },
  REQUEST: brand.brass,
};

/**
 * Mode badges always carry text: colour is never the only signal (CLAUDE.md accessibility rule).
 * A 22pt pill with a solid bottom edge, like the token buttons.
 */
export function ModeBadge({ kind }: { kind: ModeBadgeKind }) {
  const p = PALETTE[kind];
  return (
    <View
      style={[styles.badge, { backgroundColor: p.fill, boxShadow: `0px 2px 0px ${p.edge}` }]}
      accessible
      accessibilityLabel={`${kind} mode`}
    >
      <Text variant="caption" style={[styles.text, { color: p.text }]}>
        {kind}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 9,
    marginBottom: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { letterSpacing: 0.2 },
});
