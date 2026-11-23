import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { Text } from '@dyce/ui';
import { INK, SOFT } from './r3f-common/hud';
import {
  SIZE,
  cellStatus,
  coordLabel,
  placementCells,
  type Ship,
  type ShotCell,
  type Waters,
} from './sea-battle-logic';

/**
 * Sea Battle without 3D: the same waters as a flat 10 x 10 grid, and a small map for the "Your fleet" card.
 * Used when there is no WebGL (the board says so, and playing works the same: tap a square or use the arrow
 * buttons, then Fire) and for the mini map in every case. Plain views and SVG, no canvas.
 */

const SEA = '#17558F';
const SEA_ALT = '#1D6AB0';
const SHIP = '#9AA3AE';
const SUNK = '#4A2E2E';
const HIT = '#FF5A1F';
const GOLD = '#FFC94D';

export function SeaBattleFlat({
  width,
  height,
  waters,
  ships,
  cursor,
  cursorBad,
  ghost,
  picks,
  onCell,
}: {
  width: number;
  height: number;
  waters: Waters;
  /** Ships drawn afloat (yours, or all of them at the end). */
  ships: readonly Ship[];
  cursor: number | null;
  cursorBad: boolean;
  ghost: { ship: Ship; ok: boolean } | null;
  picks: readonly number[];
  onCell: ((cell: number) => void) | null;
}) {
  const label = 18;
  const side = Math.max(160, Math.min(width - 24, height - 8));
  const cell = Math.floor((side - label) / SIZE);
  const shotAt = new Map<number, ShotCell['result']>(waters.shots.map((s) => [s.cell, s.result]));
  const shipAt = new Map<number, 'ship' | 'sunk'>();
  ships.forEach((s) => placementCells(s.len, s).forEach((c) => shipAt.set(c, 'ship')));
  waters.sunk.forEach((s) => placementCells(s.len, s).forEach((c) => shipAt.set(c, 'sunk')));
  const ghostAt = new Set(ghost ? placementCells(ghost.ship.len, ghost.ship) : []);
  const pickAt = new Set(picks);

  return (
    <View style={styles.root}>
      <View style={{ width: cell * SIZE + label }}>
        <View style={[styles.row, { marginLeft: label }]}>
          {Array.from({ length: SIZE }, (_, c) => (
            <Text key={c} variant="caption" color={SOFT} style={[styles.axis, { width: cell }]}>
              {'ABCDEFGHIJ'[c]}
            </Text>
          ))}
        </View>
        {Array.from({ length: SIZE }, (_, r) => (
          <View key={r} style={styles.row}>
            <Text variant="caption" color={SOFT} style={[styles.axisRow, { width: label }]}>
              {r + 1}
            </Text>
            {Array.from({ length: SIZE }, (_, c) => {
              const id = r * SIZE + c;
              const shot = shotAt.get(id);
              const on = shipAt.get(id);
              const isCursor = cursor === id;
              const bg =
                ghost && ghostAt.has(id)
                  ? ghost.ok
                    ? '#3FBF86'
                    : '#E0584A'
                  : on === 'sunk'
                    ? SUNK
                    : on === 'ship'
                      ? SHIP
                      : (r + c) % 2
                        ? SEA_ALT
                        : SEA;
              const status = shot
                ? cellStatus(waters, id)
                : on === 'ship'
                  ? 'your ship'
                  : 'open water';
              return (
                <Pressable
                  key={c}
                  disabled={!onCell}
                  onPress={() => onCell?.(id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${coordLabel(id)}, ${status}`}
                  accessibilityState={{ selected: isCursor }}
                  style={[
                    styles.cell,
                    { width: cell, height: cell, backgroundColor: bg },
                    isCursor && { borderColor: cursorBad ? '#FF7A66' : GOLD, borderWidth: 3 },
                    pickAt.has(id) && { borderColor: GOLD, borderWidth: 2 },
                  ]}
                >
                  {shot === 'miss' ? (
                    <Text variant="caption" color={INK}>
                      •
                    </Text>
                  ) : shot ? (
                    <Text variant="callout" color={shot === 'sunk' ? '#FFD0C4' : '#FFD27A'}>
                      ×
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

/** A small map of one set of waters, for the "Your fleet" card: ships grey, hits orange, misses white. */
export function SeaBattleMini({
  size = 92,
  waters,
  ships,
}: {
  size?: number;
  waters: Waters;
  ships: readonly Ship[];
}) {
  const u = size / SIZE;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <Rect x={0} y={0} width={size} height={size} rx={4} fill={SEA} />
      {Array.from({ length: SIZE + 1 }, (_, i) => (
        <Line
          key={`v${i}`}
          x1={i * u}
          y1={0}
          x2={i * u}
          y2={size}
          stroke="#AADCFF"
          strokeOpacity={0.25}
          strokeWidth={0.6}
        />
      ))}
      {Array.from({ length: SIZE + 1 }, (_, i) => (
        <Line
          key={`h${i}`}
          x1={0}
          y1={i * u}
          x2={size}
          y2={i * u}
          stroke="#AADCFF"
          strokeOpacity={0.25}
          strokeWidth={0.6}
        />
      ))}
      {ships.map((s) => {
        const w = s.dir === 'h' ? s.len * u : u;
        const h = s.dir === 'v' ? s.len * u : u;
        return (
          <Rect
            key={s.id}
            x={s.c * u + 1}
            y={s.r * u + 1}
            width={w - 2}
            height={h - 2}
            rx={u / 2.4}
            fill={SHIP}
          />
        );
      })}
      {waters.sunk.map((s) => {
        const w = s.dir === 'h' ? s.len * u : u;
        const h = s.dir === 'v' ? s.len * u : u;
        return (
          <Rect
            key={`s-${s.id}`}
            x={s.c * u + 1}
            y={s.r * u + 1}
            width={w - 2}
            height={h - 2}
            rx={u / 2.4}
            fill={SUNK}
          />
        );
      })}
      {waters.shots.map((s) => {
        const r = Math.floor(s.cell / SIZE);
        const c = s.cell % SIZE;
        return (
          <Circle
            key={s.cell}
            cx={c * u + u / 2}
            cy={r * u + u / 2}
            r={u * (s.result === 'miss' ? 0.2 : 0.3)}
            fill={s.result === 'miss' ? '#FFFFFF' : HIT}
            fillOpacity={s.result === 'miss' ? 0.8 : 1}
          />
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  axis: { textAlign: 'center' },
  axisRow: { textAlign: 'center', alignSelf: 'center' },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(170,220,255,0.35)',
  },
});
