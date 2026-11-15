import { useMemo, useRef } from 'react';
import { PanResponder, Platform, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Text } from '@dyce/ui';
import {
  CELLS,
  GRID,
  cellAtPoint,
  cellCenter,
  cellLabel,
  extendPath,
  tapStep,
} from './word-hunt-logic';

/**
 * The renderer contract for the Word Hunt grid (ADR-018). The board owns the path, the word and the score;
 * a renderer only draws the letters and turns touches into paths. This file is the React Native views
 * renderer; a Skia renderer can take the same props and replace it without touching the board.
 */
export type WordHuntSurfaceProps = {
  /** The 16 letters, row by row. */
  letters: readonly string[];
  /** Cells picked so far, in order. */
  path: readonly number[];
  /** What the picked letters spell right now: colours the path. */
  tone: 'plain' | 'word' | 'found' | 'unknown';
  /** Side of the square grid in points. */
  size: number;
  /** Not accepting touches (round not running, or already sent). */
  disabled: boolean;
  /** The path changed (a drag moved, or a tap added or removed a letter). */
  onPathChange: (path: number[]) => void;
  /** A drag across 2+ letters ended: the word to try. */
  onCommit: (path: number[]) => void;
};

const GAP = 10;

/** Tile and edge colours: warm cream tiles, ember when picked (design: PlayWordHunt). */
const TILE = {
  plain: { fill: '#FBF1DD', edge: '#B9A57E', text: '#5A3600' },
  picked: { fill: '#E4572E', edge: '#8A2410', text: '#FFFFFF' },
  word: { fill: '#1FA467', edge: '#0C5A34', text: '#FFFFFF' },
  found: { fill: '#E3A93B', edge: '#A86F12', text: '#3A2400' },
} as const;

export function WordHuntGrid({
  letters,
  path,
  tone,
  size,
  disabled,
  onPathChange,
  onCommit,
}: WordHuntSurfaceProps) {
  const tile = (size - GAP * (GRID - 1)) / GRID;
  // The responder callbacks are made once, so they read the latest props from a ref.
  const live = useRef({ path, size, disabled, onPathChange, onCommit });
  live.current = { path, size, disabled, onPathChange, onCommit };
  const gesture = useRef<{ cells: number[]; dragged: boolean; base: readonly number[] } | null>(
    null,
  );

  const pan = useMemo(() => {
    const cellOf = (e: GestureResponderEvent) =>
      cellAtPoint(e.nativeEvent.locationX, e.nativeEvent.locationY, live.current.size);

    return PanResponder.create({
      onStartShouldSetPanResponder: () => !live.current.disabled,
      onMoveShouldSetPanResponder: () => !live.current.disabled,
      // Inside a scroll view, keep the touch once we have it.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const cell = cellOf(e);
        const base = live.current.path;
        gesture.current = { cells: cell === null ? [] : [cell], dragged: false, base };
        // First letter lights up straight away when nothing is being tapped out.
        if (cell !== null && base.length === 0) live.current.onPathChange([cell]);
      },
      onPanResponderMove: (e) => {
        const g = gesture.current;
        if (!g) return;
        const cell = cellOf(e);
        if (cell === null) return;
        const next = extendPath(g.cells, cell);
        if (next.length === g.cells.length && next.every((c, i) => c === g.cells[i])) return;
        g.cells = next;
        if (next.length >= 2) g.dragged = true;
        live.current.onPathChange(next);
      },
      onPanResponderRelease: () => finish(),
      onPanResponderTerminate: () => finish(),
    });

    function finish() {
      const g = gesture.current;
      gesture.current = null;
      if (!g) return;
      if (g.dragged && g.cells.length >= 2) {
        live.current.onCommit(g.cells);
        return;
      }
      // A tap: add the letter to the run being tapped out (tapping the last one takes it back).
      const cell = g.cells[0];
      if (cell === undefined) return;
      live.current.onPathChange(tapStep(g.base, cell));
    }
  }, []);

  /** The same tap, for a screen reader or a keyboard activating one letter. */
  const activate = (cell: number) => {
    if (live.current.disabled) return;
    live.current.onPathChange(tapStep(live.current.path, cell));
  };

  const pathTone = tone === 'word' ? TILE.word : tone === 'found' ? TILE.found : TILE.picked;
  const webOnly =
    Platform.OS === 'web'
      ? ({ touchAction: 'none', userSelect: 'none', cursor: 'pointer' } as object)
      : null;

  return (
    <View
      {...pan.panHandlers}
      style={[{ width: size, height: size }, webOnly]}
      accessibilityLabel="Letter grid, 4 by 4. Drag across touching letters, or tap them one by one, then press Add word."
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: CELLS }, (_, i) => {
          const order = path.indexOf(i);
          const picked = order >= 0;
          const pal = picked ? pathTone : TILE.plain;
          const col = i % GRID;
          const row = Math.floor(i / GRID);
          return (
            <View
              key={i}
              accessible
              accessibilityRole="button"
              accessibilityLabel={cellLabel(letters[i] ?? '', i, picked ? order : null)}
              accessibilityState={{ selected: picked, disabled }}
              accessibilityActions={[{ name: 'activate' }]}
              onAccessibilityAction={() => activate(i)}
              onAccessibilityTap={() => activate(i)}
              style={[
                styles.tile,
                {
                  left: col * (tile + GAP),
                  top: row * (tile + GAP),
                  width: tile,
                  height: tile,
                  borderRadius: tile * 0.24,
                  backgroundColor: pal.fill,
                  boxShadow: `0px ${picked ? 3 : 6}px 0px ${pal.edge}`,
                  transform: [{ translateY: picked ? 3 : 0 }],
                },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.letter, { fontSize: tile * 0.5, color: pal.text }]}
              >
                {letters[i]}
              </Text>
            </View>
          );
        })}
        {path.slice(1).map((cell, k) => {
          const from = cellCenter(path[k] as number, size);
          const to = cellCenter(cell, size);
          const len = Math.hypot(to.x - from.x, to.y - from.y);
          const angle = Math.atan2(to.y - from.y, to.x - from.x);
          return (
            <View
              key={`${path[k]}-${cell}`}
              style={[
                styles.link,
                {
                  width: len,
                  left: (from.x + to.x) / 2 - len / 2,
                  top: (from.y + to.y) / 2 - 4,
                  transform: [{ rotate: `${angle}rad` }],
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  letter: { fontFamily: 'BricolageGrotesque_800ExtraBold', fontWeight: '800' },
  link: {
    position: 'absolute',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});
