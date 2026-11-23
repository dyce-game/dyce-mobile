import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * The picture for Archery: the drawer tile, the chat card and the result. A target on a green range under a
 * pale sky, with two arrows in the gold and the wind flag. Plain SVG (no canvas).
 */
export function ArcheryArt({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View aria-hidden style={[styles.root, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="arSky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#5AA7E0" />
            <Stop offset="1" stopColor="#E8F4FA" />
          </LinearGradient>
          <LinearGradient id="arGrass" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#5E9A44" />
            <Stop offset="1" stopColor="#2E5E22" />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="80" fill="url(#arSky)" />
        <Path d="M0 44 Q10 38 20 44 T40 44 T60 44 T80 44 T100 44 V50 H0 Z" fill="#1E4A2A" />
        <Rect y="48" width="100" height="32" fill="url(#arGrass)" />
        <Path d="M46 48 L54 48 L80 80 L20 80 Z" fill="#FFFFFF" opacity="0.07" />
        <Rect x="39" y="36" width="2" height="16" fill="#6B3E1C" />
        <Rect x="59" y="36" width="2" height="16" fill="#6B3E1C" />
        <Circle cx="50" cy="30" r="21" fill="#F6F2EA" />
        <Circle cx="50" cy="30" r="16.8" fill="#1B140F" />
        <Circle cx="50" cy="30" r="12.6" fill="#2F6BEA" />
        <Circle cx="50" cy="30" r="8.4" fill="#E0453A" />
        <Circle cx="50" cy="30" r="4.2" fill="#F2C230" />
        <Path d="M49 30 L45 42" stroke="#6B3E1C" strokeWidth="1" />
        <Path d="M52 28 L57 40" stroke="#6B3E1C" strokeWidth="1" />
        <Path d="M44 42 L46.5 42.5 L45.5 45 Z" fill="#E0453A" />
        <Path d="M56 39 L58.5 40.5 L57 42.5 Z" fill="#E0453A" />
        <Rect x="84" y="22" width="1.2" height="30" fill="#DDDDDD" />
        <Path d="M85.2 23 L96 25 L85.2 28 Z" fill="#E3A93B" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ root: { overflow: 'hidden', backgroundColor: '#9ED0EE' } });
