import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import {
  HOME_COLUMN,
  NEUTRAL,
  isStar,
  layoutPawns,
  ringCell,
  rotate,
  toWorld,
  type P,
} from './ludo-logic';

/**
 * Ludo without 3D: the whole board from above as one SVG, with the same turn that puts your yard at the
 * bottom left. Used when there is no WebGL; the token strip under the board is the way to move, as it is in
 * 3D. Plain SVG, no canvas, no animation (tokens simply change place).
 */
export function LudoFlat({
  width,
  height,
  tokens,
  quads,
  colors,
  quadColors,
  turns,
  mySeat,
  legal,
}: {
  width: number;
  height: number;
  tokens: readonly (readonly number[])[];
  quads: readonly number[];
  colors: readonly string[];
  quadColors: readonly string[];
  turns: number;
  mySeat: number;
  legal: readonly number[];
}) {
  const side = Math.max(200, Math.min(width - 16, height - 8));
  const u = side / 15.6;
  const cx = (x: number) => side / 2 + x * u;
  const cz = (z: number) => side / 2 + z * u;
  const at = (p: P): [number, number] => {
    const [x, z] = toWorld(p, turns);
    return [cx(x), cz(z)];
  };
  const cell = (p: P, fill: string, key: string) => {
    const [x, y] = at(p);
    return (
      <Rect
        key={key}
        x={x - u / 2}
        y={y - u / 2}
        width={u}
        height={u}
        fill={fill}
        stroke="#9C9486"
        strokeWidth={0.8}
      />
    );
  };
  const pawns = layoutPawns(tokens, quads, turns);
  return (
    <View style={styles.root}>
      <Svg width={side} height={side} viewBox={`0 0 ${side} ${side}`}>
        <Rect x={0} y={0} width={side} height={side} rx={14} fill="#E6E1D8" />
        {[0, 1, 2, 3].map((q) => {
          const [x, y] = at(rotate([2.5, 2.5], q));
          return (
            <G key={`y${q}`}>
              <Rect
                x={x - 3 * u}
                y={y - 3 * u}
                width={6 * u}
                height={6 * u}
                fill={quadColors[q] ?? NEUTRAL}
              />
              <Rect
                x={x - 2.1 * u}
                y={y - 2.1 * u}
                width={4.2 * u}
                height={4.2 * u}
                fill="#FFFFFF"
              />
            </G>
          );
        })}
        {Array.from({ length: 52 }, (_, i) => {
          const q = i % 13 === 0 ? i / 13 : -1;
          return cell(ringCell(i), q >= 0 ? (quadColors[q] ?? NEUTRAL) : '#FFFFFF', `r${i}`);
        })}
        {[0, 1, 2, 3].flatMap((q) =>
          HOME_COLUMN.map((c, i) => cell(rotate(c, q), quadColors[q] ?? NEUTRAL, `h${q}${i}`)),
        )}
        {Array.from({ length: 52 }, (_, i) => i)
          .filter(isStar)
          .map((i) => {
            const [x, y] = at(ringCell(i));
            const r = u * 0.3;
            return (
              <Polygon
                key={`s${i}`}
                points={`${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`}
                fill="#9AA0A8"
              />
            );
          })}
        {[0, 1, 2, 3].map((q) => {
          const pts = (
            [
              [5.5, 5.5],
              [5.5, 8.5],
              [7, 7],
            ] as P[]
          )
            .map((v) => at(rotate(v, q)))
            .map((p) => p.join(','))
            .join(' ');
          return <Polygon key={`t${q}`} points={pts} fill={quadColors[q] ?? NEUTRAL} />;
        })}
        {pawns.map((p) => {
          const x = cx(p.x);
          const y = cz(p.z);
          const mine = p.seat === mySeat;
          const can = mine && legal.includes(p.token);
          return (
            <G key={`${p.seat}-${p.token}`}>
              <Circle
                cx={x}
                cy={y}
                r={u * 0.36 * p.scale}
                fill={colors[p.seat] ?? NEUTRAL}
                stroke={can ? '#E3A93B' : '#FFFFFF'}
                strokeWidth={can ? 3 : 1.6}
              />
              {mine ? (
                <SvgText
                  x={x}
                  y={y + 3.5}
                  fontSize={10 * Math.max(0.8, p.scale)}
                  fontWeight="800"
                  fill="#FFFFFF"
                  textAnchor="middle"
                >
                  {p.token + 1}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
