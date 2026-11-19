import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * The picture for Cup Pong: the drawer tile, the chat card and the result. The blue table running away
 * from you, a triangle of red cups at the far end and the ball. (A video thumbnail replaces it later.)
 */
export function CupPongArt({ style }: { style?: StyleProp<ViewStyle> }) {
  // 10 cups in rows 4-3-2-1, far row smallest (perspective).
  const rows: [y: number, n: number, w: number][] = [
    [30, 4, 7],
    [36, 3, 8],
    [42, 2, 9],
    [48, 1, 10],
  ];
  return (
    <View aria-hidden style={[styles.root, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="cpRoom" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#170C1C" />
            <Stop offset="0.5" stopColor="#3A1A14" />
            <Stop offset="1" stopColor="#1A0D0A" />
          </LinearGradient>
          <LinearGradient id="cpTable" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1B4BB0" />
            <Stop offset="1" stopColor="#3B78F2" />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="80" fill="url(#cpRoom)" />
        <Circle cx="14" cy="14" r="7" fill="#FFB347" opacity="0.4" />
        <Circle cx="82" cy="10" r="9" fill="#FF6B9D" opacity="0.3" />
        <Circle cx="64" cy="20" r="5" fill="#FFD27A" opacity="0.4" />
        <Path d="M36 26 L64 26 L96 80 L4 80 Z" fill="url(#cpTable)" />
        <Path d="M38 26 L39.2 26 L9 80 L5 80 Z" fill="#fff" opacity="0.85" />
        <Path d="M62 26 L60.8 26 L91 80 L95 80 Z" fill="#fff" opacity="0.85" />
        {rows.map(([y, n, w]) =>
          Array.from({ length: n }, (_, i) => {
            const x = 50 + (i - (n - 1) / 2) * (w + 1.6);
            return (
              <Path
                key={`${y}-${i}`}
                d={`M${x - w / 2} ${y - w * 1.15} L${x + w / 2} ${y - w * 1.15} L${x + w * 0.38} ${y} L${x - w * 0.38} ${y} Z`}
                fill="#D8262C"
              />
            );
          }),
        )}
        {rows.map(([y, n, w]) =>
          Array.from({ length: n }, (_, i) => {
            const x = 50 + (i - (n - 1) / 2) * (w + 1.6);
            return (
              <Ellipse
                key={`r${y}-${i}`}
                cx={x}
                cy={y - w * 1.15}
                rx={w / 2}
                ry={w * 0.16}
                fill="#F4F1EC"
              />
            );
          }),
        )}
        <Ellipse cx="50" cy="73" rx="6" ry="1.6" fill="#000014" opacity="0.35" />
        <Circle cx="50" cy="68" r="5" fill="#F6F3EC" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ root: { overflow: 'hidden', backgroundColor: '#170C1C' } });
