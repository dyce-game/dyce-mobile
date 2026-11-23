import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { ArtProps } from '../registry/types';

/**
 * The picture for Ayo / Mancala: the drawer tile, the chat card and the result hero. A carved wooden board
 * seen from above and slightly tilted, two rows of pits with a few seeds in each, a brass ring on one pit.
 * Plain SVG (no canvas).
 */
const COUNTS = [
  [4, 0, 6, 5, 4, 4],
  [5, 4, 4, 0, 7, 3],
];

function seeds(cx: number, cy: number, n: number, key: string) {
  return Array.from({ length: n }, (_, k) => {
    const a = k * 2.4;
    const r = Math.min(4.4, 1.9 * Math.sqrt(k + 0.6));
    return (
      <Ellipse
        key={`${key}${k}`}
        cx={cx + Math.cos(a) * r}
        cy={cy + Math.sin(a) * r * 0.8}
        rx={1.9}
        ry={1.4}
        fill={k % 2 ? '#C9B48E' : '#E2D2B4'}
        stroke="#4A3A22"
        strokeWidth={0.3}
      />
    );
  });
}

export function AyoArt({ style }: ArtProps) {
  const x0 = 16.5;
  const step = 13.4;
  return (
    <View aria-hidden style={[styles.root, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="ayoRoom" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#3A2416" />
            <Stop offset="1" stopColor="#120A06" />
          </LinearGradient>
          <LinearGradient id="ayoWood" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#B07A45" />
            <Stop offset="0.5" stopColor="#A86F3E" />
            <Stop offset="1" stopColor="#7A4A22" />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="80" fill="url(#ayoRoom)" />
        <Ellipse cx="50" cy="38" rx="46" ry="18" fill="#FFC878" opacity="0.14" />
        <Rect x="6" y="20" width="88" height="44" rx="11" fill="#4A2812" />
        <Rect x="6" y="16" width="88" height="44" rx="11" fill="url(#ayoWood)" />
        {COUNTS.map((row, r) =>
          row.map((n, c) => {
            const cx = x0 + c * step;
            const cy = r === 0 ? 29 : 47;
            const hi = r === 1 && c === 4;
            return (
              <G key={`${r}${c}`}>
                <Circle cx={cx} cy={cy} r={6.2} fill="#2A1608" />
                <Circle cx={cx} cy={cy + 0.8} r={5.2} fill="#4A2A12" />
                {hi ? (
                  <Circle cx={cx} cy={cy} r={7.4} fill="none" stroke="#E3A93B" strokeWidth={1.4} />
                ) : null}
                {seeds(cx, cy, n, `${r}${c}`)}
              </G>
            );
          }),
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ root: { overflow: 'hidden', backgroundColor: '#120A06' } });
