import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@dyce/ui';
import type { ResultExtrasProps } from '../registry/types';
import { SeaBattleMini } from './SeaBattleFlat';
import { afloatLine, countsOf, foeOf, meOf, type SeaBattleView } from './sea-battle-logic';

/**
 * Under the winner: both fleets as they ended, side by side (every fleet is public once the game is over), with
 * what each side hit. Follows the device theme (the play table does not).
 */
export function SeaBattleResult({ view, myId, nameOf }: ResultExtrasProps<SeaBattleView>) {
  const { colors } = useTheme();
  const me = meOf(view, myId);
  const foe = foeOf(view, myId);
  const total = view.fleetSpec.length;
  const side = (id: string, label: string) => {
    const w = view.boards[id]!;
    const c = countsOf(w);
    // Shots against `id`'s waters were fired by the other player.
    const line = `${label}: ${afloatLine(w, total)}`;
    return (
      <View
        key={id}
        style={styles.col}
        accessible
        accessibilityLabel={`${line}. ${c.hits} hits and ${c.misses} misses against this fleet.`}
      >
        <SeaBattleMini size={136} waters={w} ships={w.ships ?? []} />
        <Text variant="callout" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="footnote" color="sub" numberOfLines={2} style={styles.center}>
          {w.shipsLeft} of {total} afloat · {c.hits} hit, {c.misses} missed
        </Text>
      </View>
    );
  };
  return (
    <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.row}>
        {side(me, myId === me ? 'Your fleet' : `${nameOf(me)}'s fleet`)}
        {side(foe, `${nameOf(foe)}'s fleet`)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, borderWidth: 1, padding: 12, alignSelf: 'stretch' },
  row: { flexDirection: 'row', justifyContent: 'space-around', gap: 12 },
  col: { alignItems: 'center', gap: 4, flexShrink: 1 },
  center: { textAlign: 'center' },
});
