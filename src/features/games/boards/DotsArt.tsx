import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Rect, RadialGradient, Stop } from 'react-native-svg';
import type { ArtProps } from '../registry/types';

/**
 * The picture for Dots & Boxes: the drawer tile, the chat card and the result hero. A 4 x 4 corner of squared
 * paper on the dark table with a few lines drawn in red and blue and two claimed boxes. Plain SVG.
 */
const S = 16;
const X0 = 18;
const Y0 = 8;
const RED = '#C93E1C';
const BLUE = '#2457D6';

const H: [number, number, string][] = [
  [0, 0, RED],
  [0, 1, RED],
  [0, 2, BLUE],
  [1, 0, RED],
  [1, 1, RED],
  [2, 0, BLUE],
  [2, 2, RED],
  [3, 1, BLUE],
];
const V: [number, number, string][] = [
  [0, 0, RED],
  [0, 1, RED],
  [0, 2, BLUE],
  [0, 3, BLUE],
  [1, 0, BLUE],
  [1, 1, RED],
  [2, 2, RED],
];

export function DotsArt({ style }: ArtProps) {
  return (
    <View aria-hidden style={[styles.root, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="dbArt" cx="0.5" cy="0.3" r="0.9">
            <Stop offset="0" stopColor="#2A2420" />
            <Stop offset="1" stopColor="#0F0D0B" />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="80" fill="url(#dbArt)" />
        <Rect x="10" y="2" width="80" height="76" rx="6" fill="#F6EEDC" />
        <Rect
          x={X0 + 1}
          y={Y0 + 1}
          width={S - 2}
          height={S - 2}
          rx="1.5"
          fill={RED}
          opacity="0.85"
        />
        <Rect
          x={X0 + S + 1}
          y={Y0 + 1}
          width={S - 2}
          height={S - 2}
          rx="1.5"
          fill={RED}
          opacity="0.85"
        />
        <Rect
          x={X0 + 2 * S + 1}
          y={Y0 + 1}
          width={S - 2}
          height={S - 2}
          rx="1.5"
          fill={BLUE}
          opacity="0.85"
        />
        {H.map(([r, c, col]) => (
          <Rect
            key={`h${r}${c}`}
            x={X0 + c * S + 1.5}
            y={Y0 + r * S - 1}
            width={S - 3}
            height="2"
            rx="1"
            fill={col}
          />
        ))}
        {V.map(([r, c, col]) => (
          <Rect
            key={`v${r}${c}`}
            x={X0 + c * S - 1}
            y={Y0 + r * S + 1.5}
            width="2"
            height={S - 3}
            rx="1"
            fill={col}
          />
        ))}
        {Array.from({ length: 25 }, (_, i) => (
          <Circle
            key={i}
            cx={X0 + (i % 5) * S}
            cy={Y0 + Math.floor(i / 5) * S}
            r="2"
            fill="#1B140F"
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ root: { overflow: 'hidden', backgroundColor: '#0F0D0B' } });
