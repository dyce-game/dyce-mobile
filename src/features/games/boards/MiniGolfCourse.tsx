import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import {
  MINI_GOLF_CUP_R,
  MINI_GOLF_FIELD_H,
  MINI_GOLF_FIELD_W,
  type MiniGolfHole,
} from '@dyce/games';
import type { Pt } from './mini-golf-logic';

/**
 * The hole drawn from its geometry (centimetres, y down: the same numbers the physics uses). It is the
 * renderer behind the Mini Golf board: grass, sand, brick walls, bumpers, the cup and its flag. It draws
 * nothing that moves, so it is memoised and redrawn only when the hole or the size changes.
 *
 * The board uses react-native-svg rather than Skia (docs/DECISIONS.md, ADR-029 on the app side): the same
 * view runs on iOS, Android and the web preview, and a hole is a few dozen shapes.
 */
export const GRASS_A = '#3BA55C';
export const GRASS_B = '#33944F';
export const SAND = '#E9CF8E';
export const BRICK = '#B5462E';
export const BRICK_EDGE = '#6A2414';
export const BUMPER = '#E3A93B';
export const BUMPER_EDGE = '#A86F12';

export const MiniGolfCourse = memo(function MiniGolfCourse({
  hole,
  width,
  label,
}: {
  hole: MiniGolfHole;
  /** The width in points; the height is twice that. */
  width: number;
  label: string;
}) {
  const W = MINI_GOLF_FIELD_W;
  const H = MINI_GOLF_FIELD_H;
  const stripes = Array.from({ length: 8 }, (_, i) => i);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={width} height={width * 2} viewBox={`0 0 ${W} ${H}`}>
        <Rect x={0} y={0} width={W} height={H} fill={GRASS_A} />
        {stripes.map((i) =>
          i % 2 === 1 ? (
            <Rect key={i} x={0} y={i * 100} width={W} height={100} fill={GRASS_B} />
          ) : null,
        )}
        {hole.sand.map((s, i) => (
          <Rect
            key={`s${i}`}
            x={s.x}
            y={s.y}
            width={s.w}
            height={s.h}
            rx={18}
            fill={SAND}
            stroke="#C9A95F"
            strokeWidth={3}
          />
        ))}
        {hole.walls.map((w, i) => (
          <G key={`w${i}`}>
            <Rect x={w.x} y={w.y + 6} width={w.w} height={w.h} rx={4} fill={BRICK_EDGE} />
            <Rect x={w.x} y={w.y} width={w.w} height={w.h} rx={4} fill={BRICK} />
          </G>
        ))}
        {hole.bumpers.map((b, i) => (
          <G key={`b${i}`}>
            <Circle cx={b.x} cy={b.y + 5} r={b.r} fill={BUMPER_EDGE} />
            <Circle cx={b.x} cy={b.y} r={b.r} fill={BUMPER} />
            <Circle
              cx={b.x - b.r * 0.3}
              cy={b.y - b.r * 0.3}
              r={b.r * 0.3}
              fill="rgba(255,255,255,0.45)"
            />
          </G>
        ))}
        <Flag cup={hole.cup} />
        <Circle cx={hole.tee.x} cy={hole.tee.y} r={9} fill="rgba(255,255,255,0.2)" />
      </Svg>
    </View>
  );
});

/** The cup with its ring and a flag on a pole. */
function Flag({ cup }: { cup: Pt }) {
  const r = MINI_GOLF_CUP_R;
  return (
    <G>
      <Circle cx={cup.x} cy={cup.y} r={r + 2.5} fill="#E8F5E0" />
      <Circle cx={cup.x} cy={cup.y} r={r} fill="#0A0F0A" />
      <Line
        x1={cup.x}
        y1={cup.y}
        x2={cup.x}
        y2={cup.y - 50}
        stroke="#F4F4F4"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Path
        d={`M ${cup.x + 1.5} ${cup.y - 50} L ${cup.x + 30} ${cup.y - 40} L ${cup.x + 1.5} ${cup.y - 30} Z`}
        fill="#E5482A"
      />
    </G>
  );
}
