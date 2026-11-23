import { StyleSheet, View } from 'react-native';
import Svg, { Defs, G, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ChessPieceShapes } from './ChessPiece';
import type { ArtProps } from '../registry/types';

/**
 * The picture for Chess: the drawer tile, the chat card and the result hero. A corner of the wooden board on
 * the dark table with a white knight and king against a black queen. Plain SVG, no canvas.
 */
const SQUARES = 4;

export function ChessArt({ style }: ArtProps) {
  const cells: { x: number; y: number; light: boolean }[] = [];
  for (let r = 0; r < SQUARES; r++) {
    for (let c = 0; c < SQUARES; c++)
      cells.push({ x: 20 + c * 15, y: 10 + r * 15, light: (r + c) % 2 === 0 });
  }
  const piece = (p: string, c: number, r: number) => (
    <G
      key={`${p}${c}${r}`}
      transform={`translate(${20 + c * 15 + 0.5} ${10 + r * 15 + 0.5}) scale(0.14)`}
    >
      <ChessPieceShapes piece={p} />
    </G>
  );
  return (
    <View aria-hidden style={[styles.root, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="chArt" cx="0.5" cy="0.3" r="0.9">
            <Stop offset="0" stopColor="#2E2016" />
            <Stop offset="1" stopColor="#0E0905" />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="80" fill="url(#chArt)" />
        <Rect x="16" y="6" width="68" height="68" rx="5" fill="#6B4220" />
        {cells.map((c) => (
          <Rect
            key={`${c.x}${c.y}`}
            x={c.x}
            y={c.y}
            width="15"
            height="15"
            fill={c.light ? '#E8D3AE' : '#9A6B42'}
          />
        ))}
        {piece('q', 1, 0)}
        {piece('n', 2, 2)}
        {piece('K', 0, 3)}
        {piece('P', 3, 3)}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ root: { overflow: 'hidden', backgroundColor: '#0E0905' } });
