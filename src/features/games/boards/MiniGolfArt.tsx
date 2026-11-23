import { StyleSheet } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import type { ArtProps } from '../registry/types';

/**
 * The picture for Mini Golf: a slice of green with a brick wall, the ball at the bottom, the flag at the top
 * and a dotted aim line (design: PlayMiniGolf). Plain SVG, light enough for every chat card.
 */
export function MiniGolfArt({ style, compact, hero }: ArtProps) {
  const w = hero ? 150 : undefined;
  const h = hero ? 120 : undefined;
  return (
    <Svg
      aria-hidden
      viewBox="0 0 200 160"
      preserveAspectRatio="xMidYMid slice"
      width={w ?? '100%'}
      height={h ?? '100%'}
      style={[hero ? styles.hero : null, style]}
    >
      <Rect x={0} y={0} width={200} height={160} fill="#3BA55C" />
      <Rect x={0} y={0} width={200} height={40} fill="#33944F" />
      <Rect x={0} y={80} width={200} height={40} fill="#33944F" />
      <Rect x={60} y={62} width={70} height={14} rx={3} fill="#6A2414" />
      <Rect x={60} y={58} width={70} height={14} rx={3} fill="#B5462E" />
      <Rect x={140} y={92} width={34} height={46} rx={14} fill="#E9CF8E" />
      <G>
        <Circle cx={100} cy={26} r={8} fill="#0A0F0A" stroke="#E8F5E0" strokeWidth={2.5} />
        <Line
          x1={100}
          y1={26}
          x2={100}
          y2={4}
          stroke="#F4F4F4"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <Path d="M 101 4 L 118 10 L 101 16 Z" fill="#E5482A" />
      </G>
      {compact ? null : (
        <Line
          x1={92}
          y1={134}
          x2={50}
          y2={84}
          stroke="#FFFFFF"
          strokeWidth={2.5}
          strokeDasharray="2 6"
          strokeLinecap="round"
        />
      )}
      <Circle cx={94} cy={140} r={8} fill="rgba(0,0,0,0.3)" />
      <Circle cx={92} cy={136} r={8} fill="#FFFFFF" stroke="#A9A398" strokeWidth={1.2} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 22, overflow: 'hidden' },
});
