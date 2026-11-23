import { StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from 'react-native-svg';
import { useId } from 'react';
import type { ArtProps } from '../registry/types';

/**
 * The picture for Tanks: a red tank and a blue tank on hills at sunset, with a dotted arc between them
 * (design: PlayTanks). Plain SVG, light enough for every chat card.
 */
export function TanksArt({ style, compact, hero }: ArtProps) {
  const id = `ta${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
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
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1E1638" />
          <Stop offset="0.5" stopColor="#5A2A55" />
          <Stop offset="1" stopColor="#FFB27A" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={200} height={160} fill={`url(#${id})`} />
      <Circle cx={150} cy={88} r={26} fill="#FFE3A0" opacity={0.8} />
      <Polygon points="0,110 40,92 90,106 140,84 200,100 200,160 0,160" fill="#5A3A22" />
      <Path
        d="M0 110 L40 92 L90 106 L140 84 L200 100"
        fill="none"
        stroke="#6FA34A"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      {compact ? null : (
        <Path
          d="M52 84 Q100 20 148 70"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2.5}
          strokeDasharray="2 6"
          strokeLinecap="round"
        />
      )}
      <G>
        <Rect x={30} y={90} width={34} height={8} rx={4} fill="#1E1A17" />
        <Rect x={34} y={82} width={26} height={10} rx={3} fill="#C93E1C" />
        <Line
          x1={47}
          y1={80}
          x2={66}
          y2={66}
          stroke="#2B2B2B"
          strokeWidth={4}
          strokeLinecap="round"
        />
        <Circle cx={47} cy={80} r={6} fill="#F07A4A" />
      </G>
      <G>
        <Rect x={138} y={72} width={34} height={8} rx={4} fill="#1E1A17" />
        <Rect x={142} y={64} width={26} height={10} rx={3} fill="#2457D6" />
        <Line
          x1={155}
          y1={62}
          x2={136}
          y2={50}
          stroke="#2B2B2B"
          strokeWidth={4}
          strokeLinecap="round"
        />
        <Circle cx={155} cy={62} r={6} fill="#6FA8F5" />
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 22, overflow: 'hidden' },
});
