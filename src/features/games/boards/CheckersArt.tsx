import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { ArtProps } from '../registry/types';

/**
 * The picture for Checkers: the drawer tile, the chat card and the result hero. A corner of the board on the
 * dark table with red and black discs and one crowned king. Plain SVG, no canvas.
 */
const N = 4;
const S = 15;
const X0 = 20;
const Y0 = 10;

const DISCS: { c: number; r: number; red: boolean; king?: boolean }[] = [
  { c: 1, r: 0, red: false },
  { c: 3, r: 0, red: false },
  { c: 2, r: 1, red: false },
  { c: 1, r: 2, red: true },
  { c: 0, r: 3, red: true, king: true },
  { c: 2, r: 3, red: true },
];

export function CheckersArt({ style }: ArtProps) {
  const cells: { x: number; y: number; dark: boolean }[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++)
      cells.push({ x: X0 + c * S, y: Y0 + r * S, dark: (r + c) % 2 === 1 });
  }
  return (
    <View aria-hidden style={[styles.root, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="ckArt" cx="0.5" cy="0.3" r="0.9">
            <Stop offset="0" stopColor="#2A1A14" />
            <Stop offset="1" stopColor="#0C0705" />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="80" fill="url(#ckArt)" />
        <Rect x="16" y="6" width="68" height="68" rx="5" fill="#4A2E1C" />
        {cells.map((c) => (
          <Rect
            key={`${c.x}${c.y}`}
            x={c.x}
            y={c.y}
            width={S}
            height={S}
            fill={c.dark ? '#2F2A26' : '#E9D9B6'}
          />
        ))}
        {DISCS.map((d) => {
          const cx = X0 + d.c * S + S / 2;
          const cy = Y0 + d.r * S + S / 2;
          return (
            <Circle
              key={`${d.c}${d.r}`}
              cx={cx}
              cy={cy + 0.8}
              r="5.6"
              fill={d.red ? '#7A1E0C' : '#000'}
            />
          );
        })}
        {DISCS.map((d) => {
          const cx = X0 + d.c * S + S / 2;
          const cy = Y0 + d.r * S + S / 2;
          return (
            <Circle
              key={`t${d.c}${d.r}`}
              cx={cx}
              cy={cy}
              r="5.6"
              fill={d.red ? '#C93E1C' : '#1E1A17'}
              stroke="rgba(255,255,255,0.28)"
              strokeWidth="0.8"
            />
          );
        })}
        {DISCS.filter((d) => d.king).map((d) => {
          const cx = X0 + d.c * S + S / 2;
          const cy = Y0 + d.r * S + S / 2;
          return (
            <Path
              key="k"
              d={`M${cx - 3.2} ${cy + 2.2} L${cx - 2.6} ${cy - 2} L${cx - 1} ${cy} L${cx} ${cy - 2.8} L${cx + 1} ${cy} L${cx + 2.6} ${cy - 2} L${cx + 3.2} ${cy + 2.2} Z`}
              fill="#FFD27A"
              stroke="#A86F12"
              strokeWidth="0.4"
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ root: { overflow: 'hidden', backgroundColor: '#0C0705' } });
