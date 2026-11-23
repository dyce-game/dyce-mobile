import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Polygon, Rect, Stop } from 'react-native-svg';
import type { ArtProps } from '../registry/types';

/**
 * The picture for Ludo: the drawer tile, the chat card and the result hero. The cross-shaped board tilted
 * towards you with its four coloured yards and home columns, a few tokens and a die. Plain SVG (no canvas).
 */
const C = { g: '#2BB673', r: '#E0453A', y: '#FFB020', b: '#2457D6' };

export function LudoArt({ style }: ArtProps) {
  // an 11 x 11 grid, drawn flat and then tilted by the transform below
  const cell = 5.2;
  const x0 = 21;
  const y0 = 9;
  const at = (c: number, r: number) => ({ x: x0 + c * cell, y: y0 + r * cell });
  const tiles: { c: number; r: number; fill: string }[] = [];
  for (let i = 1; i <= 4; i++) {
    tiles.push({ c: 5, r: i, fill: C.g }, { c: 5, r: 10 - i, fill: C.b });
    tiles.push({ c: i, r: 5, fill: C.r }, { c: 10 - i, r: 5, fill: C.y });
  }
  return (
    <View aria-hidden style={[styles.root, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="ludoRoom" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#202020" />
            <Stop offset="1" stopColor="#131313" />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="80" fill="url(#ludoRoom)" />
        <G transform="translate(0 6) scale(1 0.78)">
          <Rect
            x={x0 - 3}
            y={y0 - 3}
            width={11 * cell + 6}
            height={11 * cell + 6}
            rx={5}
            fill="#8A7A62"
          />
          <Rect
            x={x0 - 1.4}
            y={y0 - 1.4}
            width={11 * cell + 2.8}
            height={11 * cell + 2.8}
            rx={4}
            fill="#E6E1D8"
          />
          {[
            [0, 0, C.r],
            [7, 0, C.g],
            [0, 7, C.b],
            [7, 7, C.y],
          ].map(([c, r, f]) => (
            <G key={`${c}${r}`}>
              <Rect
                x={at(c as number, r as number).x}
                y={at(c as number, r as number).y}
                width={4 * cell}
                height={4 * cell}
                fill={f as string}
              />
              <Rect
                x={at(c as number, r as number).x + cell * 0.6}
                y={at(c as number, r as number).y + cell * 0.6}
                width={2.8 * cell}
                height={2.8 * cell}
                fill="#FFFFFF"
              />
            </G>
          ))}
          {tiles.map((t) => (
            <Rect
              key={`${t.c}-${t.r}`}
              x={at(t.c, t.r).x}
              y={at(t.c, t.r).y}
              width={cell - 0.4}
              height={cell - 0.4}
              fill={t.fill}
            />
          ))}
          <Polygon
            points={`${at(4, 4).x},${at(4, 4).y} ${at(7, 4).x},${at(7, 4).y} ${at(5.5, 5.5).x},${at(5.5, 5.5).y}`}
            fill={C.g}
          />
          <Polygon
            points={`${at(4, 4).x},${at(4, 4).y} ${at(4, 7).x},${at(4, 7).y} ${at(5.5, 5.5).x},${at(5.5, 5.5).y}`}
            fill={C.r}
          />
          <Polygon
            points={`${at(7, 4).x},${at(7, 4).y} ${at(7, 7).x},${at(7, 7).y} ${at(5.5, 5.5).x},${at(5.5, 5.5).y}`}
            fill={C.y}
          />
          <Polygon
            points={`${at(4, 7).x},${at(4, 7).y} ${at(7, 7).x},${at(7, 7).y} ${at(5.5, 5.5).x},${at(5.5, 5.5).y}`}
            fill={C.b}
          />
          {[
            [2, 2, C.r],
            [8, 2, C.g],
            [2, 8, C.b],
            [8, 8, C.y],
            [3, 5, C.r],
            [5, 3, C.g],
            [7, 8, C.y],
          ].map(([c, r, f], i) => (
            <Circle
              key={i}
              cx={at(c as number, r as number).x + cell / 2}
              cy={at(c as number, r as number).y + cell / 2}
              r={2.2}
              fill={f as string}
              stroke="#FFFFFF"
              strokeWidth={0.8}
            />
          ))}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ root: { overflow: 'hidden', backgroundColor: '#131313' } });
