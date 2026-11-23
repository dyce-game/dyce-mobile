import { StyleSheet, View } from 'react-native';
import Svg, { Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { COLOURS, SHAPES, shapePath } from './filler-logic';
import type { ArtProps } from '../registry/types';

/**
 * The picture for Filler: the drawer tile, the chat card and the result hero. A small colour grid on the dark
 * table with a red region growing from the bottom-left and a blue one from the top-right. Plain SVG.
 */
const COLS = 6;
const S = 11.5;
const X0 = 15.5;
const Y0 = 10;

// colour index per cell, row-major (0 red, 1 yellow, 2 green, 3 blue, 4 purple, 5 charcoal)
const GRID = [
  4, 1, 2, 5, 3, 3, 2, 5, 1, 4, 3, 2, 1, 3, 4, 2, 5, 1, 0, 2, 5, 1, 4, 5, 0, 0, 4, 2, 1, 2,
];

export function FillerArt({ style }: ArtProps) {
  return (
    <View aria-hidden style={[styles.root, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="flArt" cx="0.5" cy="0.3" r="0.9">
            <Stop offset="0" stopColor="#2A2420" />
            <Stop offset="1" stopColor="#0F0D0B" />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="80" fill="url(#flArt)" />
        <Rect x="11" y="6" width="78" height="68" rx="5" fill="#15120F" />
        {GRID.map((k, i) => {
          const r = Math.floor(i / COLS);
          const c = i % COLS;
          const x = X0 + c * S * 1.1;
          const y = Y0 + r * S * 1.1;
          const spec = COLOURS[k]!;
          return (
            <G key={i}>
              <Rect x={x} y={y + 0.8} width={S} height={S} rx="2" fill={spec.edge} />
              <Rect x={x} y={y} width={S} height={S} rx="2" fill={spec.fill} />
              <Path
                d={shapePath(SHAPES[k]!, x + S / 2, y + S / 2, S * 0.2)}
                fill="#FFFFFF"
                opacity="0.45"
              />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ root: { overflow: 'hidden', backgroundColor: '#0F0D0B' } });
