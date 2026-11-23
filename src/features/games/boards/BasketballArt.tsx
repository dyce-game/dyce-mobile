import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * The picture for Basketball: the drawer tile, the chat card and the result. A hoop and backboard over a
 * wooden court at night, with the ball on its way. Plain SVG (no canvas).
 */
export function BasketballArt({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View aria-hidden style={[styles.root, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="bkWall" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0E1424" />
            <Stop offset="1" stopColor="#1C2440" />
          </LinearGradient>
          <LinearGradient id="bkBall" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFB27A" />
            <Stop offset="0.5" stopColor="#E8701E" />
            <Stop offset="1" stopColor="#9A3E08" />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="80" fill="url(#bkWall)" />
        <Circle cx="22" cy="10" r="5" fill="#FFE2B0" opacity="0.4" />
        <Circle cx="80" cy="8" r="6" fill="#FFD27A" opacity="0.35" />
        <Path d="M32 52 L68 52 L100 80 L0 80 Z" fill="#C98A4E" />
        <Path d="M42 52 L58 52 L66 66 L34 66 Z" fill="#C93E1C" opacity="0.55" />
        <Rect x="49" y="30" width="2" height="22" fill="#4A4A4A" />
        <Rect
          x="30"
          y="8"
          width="40"
          height="26"
          rx="2"
          fill="#DCEBFF"
          opacity="0.85"
          stroke="#F6F2EA"
          strokeWidth="1.4"
        />
        <Path d="M42 24 L42 31 L58 31 L58 24" fill="none" stroke="#C93E1C" strokeWidth="1.2" />
        <Path
          d="M41 34 L59 34 L55 44 L45 44 Z"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="0.6"
          opacity="0.9"
        />
        <Ellipse cx="50" cy="34" rx="9" ry="2.2" fill="none" stroke="#E8701E" strokeWidth="1.6" />
        <Ellipse cx="50" cy="74" rx="9" ry="1.8" fill="#000000" opacity="0.3" />
        <Circle cx="50" cy="66" r="8.5" fill="url(#bkBall)" />
        <Path d="M50 57.5 V74.5 M41.5 66 H58.5" stroke="#2A1408" strokeWidth="0.8" />
        <Path
          d="M44 58.5 C48 63 48 69 44 73.5 M56 58.5 C52 63 52 69 56 73.5"
          stroke="#2A1408"
          strokeWidth="0.8"
          fill="none"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ root: { overflow: 'hidden', backgroundColor: '#0E1424' } });
