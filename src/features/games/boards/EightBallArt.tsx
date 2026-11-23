import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * The picture for 8 Ball: the drawer tile, the chat card and the result. A green table running away from
 * you, a triangle of balls at the far end, the cue ball and the cue. Plain SVG (no canvas): it is drawn in
 * every chat card.
 */
export function EightBallArt({ style }: { style?: StyleProp<ViewStyle> }) {
  const rack: [number, number, string][] = [
    [50, 31, '#F5C518'],
    [46.5, 28.6, '#2457D6'],
    [53.5, 28.6, '#111111'],
    [43, 26.2, '#E0453A'],
    [50, 26.2, '#6B2FB3'],
    [57, 26.2, '#FF7A1A'],
  ];
  return (
    <View aria-hidden style={[styles.root, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="ebRoom" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#3A2A1A" />
            <Stop offset="1" stopColor="#0B0806" />
          </LinearGradient>
          <LinearGradient id="ebFelt" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0F6B40" />
            <Stop offset="1" stopColor="#17985C" />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="80" fill="url(#ebRoom)" />
        <Path d="M30 16 L70 16 L100 80 L0 80 Z" fill="#6B3A1C" />
        <Path d="M33 18.5 L67 18.5 L94 80 L6 80 Z" fill="#0C5A38" />
        <Path d="M35 20 L65 20 L90 80 L10 80 Z" fill="url(#ebFelt)" />
        <Ellipse cx="34" cy="19" rx="2.6" ry="1.2" fill="#030201" />
        <Ellipse cx="66" cy="19" rx="2.6" ry="1.2" fill="#030201" />
        {rack.map(([x, y, c]) => (
          <Circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill={c} />
        ))}
        <Ellipse cx="50" cy="64" rx="5.6" ry="1.6" fill="#000800" opacity="0.35" />
        <Circle cx="50" cy="61" r="5" fill="#F6F2EA" />
        <Path d="M49 68 L51 68 L58 92 L42 92 Z" fill="#E9C98F" />
        <Path d="M49 68 L51 68 L51.4 70.4 L48.6 70.4 Z" fill="#2F6BEA" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ root: { overflow: 'hidden', backgroundColor: '#120C08' } });
