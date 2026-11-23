import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@dyce/ui';
import { INK } from './r3f-common/hud';
import { myRow, theirRow, type Display, type Variant } from './ayo-logic';

/**
 * The Ayo / Mancala board without 3D: two rows of pits (and, for Mancala, a store at each end) as plain views,
 * each showing its count as a number. Used when there is no WebGL, with the same tap-a-pit controls. Plain
 * views, no canvas, no animation (the counts simply change).
 */

const WOOD = '#A86F3E';
const PIT = '#4A2A12';
const BRASS = '#E3A93B';

export function AyoFlat({
  width,
  height,
  variant,
  seat,
  display,
  legal,
  selected,
  onPit,
}: {
  width: number;
  height: number;
  variant: Variant;
  seat: 0 | 1;
  display: Display;
  legal: readonly number[];
  selected: number | null;
  onPit: ((pit: number) => void) | null;
}) {
  const kalah = variant === 'kalah';
  const storeW = kalah ? 56 : 0;
  const pit = Math.max(
    44,
    Math.min(64, Math.floor((width - 40 - storeW * 2 - (kalah ? 16 : 0)) / 6.4)),
  );
  const gap = 8;
  const boardH = Math.min(height - 8, pit * 2 + gap * 3 + 24);
  const store = (s: 0 | 1, label: string) => (
    <View
      key={s}
      accessible
      accessibilityLabel={`${label}: ${display.stores[s]} seeds`}
      style={[styles.store, { width: storeW, height: boardH - 16 }]}
    >
      <Text variant="title" color={INK}>
        {display.stores[s]}
      </Text>
    </View>
  );
  const cell = (id: number, mine: boolean) => {
    const n = display.pits[id] ?? 0;
    const on = mine && legal.includes(id);
    const sel = selected === id;
    const k = mine ? id - seat * 6 + 1 : 11 - id - seat * 6 + 1;
    const label = `${mine ? 'Your' : 'Their'} pit ${k}, ${n} ${n === 1 ? 'seed' : 'seeds'}${
      sel ? ', selected' : ''
    }`;
    return (
      <Pressable
        key={id}
        disabled={!onPit || !on}
        onPress={() => onPit?.(id)}
        accessibilityRole={mine ? 'button' : 'text'}
        accessibilityLabel={label}
        accessibilityState={{ selected: sel, disabled: !onPit || !on }}
        style={[
          styles.pit,
          { width: pit, height: pit, borderRadius: pit / 2 },
          on && { borderColor: BRASS, borderWidth: 2 },
          sel && { borderColor: '#FFD27A', borderWidth: 4 },
        ]}
      >
        <Text variant="headline" color={INK}>
          {n}
        </Text>
      </Pressable>
    );
  };
  const ownStore = seat;
  const theirStore = (1 - seat) as 0 | 1;
  return (
    <View style={styles.root}>
      <View style={[styles.board, { height: boardH }]}>
        {kalah ? store(theirStore, 'Their store') : null}
        <View style={styles.rows}>
          <View style={styles.row}>{theirRow(seat).map((id) => cell(id, false))}</View>
          <View style={styles.row}>{myRow(seat).map((id) => cell(id, true))}</View>
        </View>
        {kalah ? store(ownStore, 'Your store') : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  board: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 30,
    backgroundColor: WOOD,
  },
  rows: { gap: 8, paddingVertical: 8 },
  row: { flexDirection: 'row', gap: 8 },
  pit: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PIT,
    borderWidth: 0,
  },
  store: { alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: PIT },
});
