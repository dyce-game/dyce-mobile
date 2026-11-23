import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { ArtProps } from '../registry/types';

/**
 * The picture for Sea Battle: the drawer tile, the chat card and the result hero. A corner view of the sea with
 * its grid, two grey ships, a flame, and a few white rings where shots missed. Plain SVG (no canvas).
 */
export function SeaBattleArt({ style }: ArtProps) {
  return (
    <View aria-hidden style={[styles.root, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="sbSky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0A1A33" />
            <Stop offset="0.5" stopColor="#10325C" />
            <Stop offset="1" stopColor="#0B2447" />
          </LinearGradient>
          <LinearGradient id="sbSea" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#2E7BC4" />
            <Stop offset="1" stopColor="#0E3D6E" />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="80" fill="url(#sbSky)" />
        <Circle cx="50" cy="-6" r="34" fill="#FFAA5A" opacity="0.16" />
        {/* the sea, turned like the board */}
        <G>
          <Path d="M50 8 L94 36 L50 70 L6 36 Z" fill="#06182F" />
          <Path d="M50 11 L89 36 L50 66 L11 36 Z" fill="url(#sbSea)" />
          <Path
            d="M30.5 23.5 L69.5 48.5 M41 17 L80 42 M20 30 L59 55 M69.5 23.5 L30.5 48.5 M59 17 L20 42 M80 30 L41 55"
            stroke="#AADCFF"
            strokeWidth="0.6"
            opacity="0.45"
          />
        </G>
        {/* ships */}
        <Path d="M31 33 L55 48 L52 51 L28 36 Z" fill="#8C949E" />
        <Path d="M38 36 L44 40 L42 42 L36 38 Z" fill="#C9D0D8" />
        <Path d="M60 30 L72 38 L69.6 40 L58 32 Z" fill="#3B2F31" />
        {/* a hit and some misses */}
        <Path d="M46 41 Q50 31 52 24 Q55 33 54 41 Z" fill="#FF5A1F" />
        <Path d="M48 41 Q50 35 51.4 31 Q53 36 52.4 41 Z" fill="#FFE08A" />
        <Circle cx="50" cy="22" r="3.4" fill="#3A3A3A" opacity="0.4" />
        <Circle
          cx="38"
          cy="52"
          r="2.6"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1"
          opacity="0.8"
        />
        <Circle
          cx="68"
          cy="52"
          r="2.6"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1"
          opacity="0.8"
        />
        <Circle
          cx="24"
          cy="40"
          r="2.2"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1"
          opacity="0.7"
        />
        <Path d="M66 22 L66 29 M62.5 25.5 L69.5 25.5" stroke="#E3A93B" strokeWidth="1.2" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ root: { overflow: 'hidden', backgroundColor: '#0A1A33' } });
