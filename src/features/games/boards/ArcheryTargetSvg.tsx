import Svg, { Circle, G, Line } from 'react-native-svg';
import type { ArrowRecord } from './archery-logic';

const RINGS: readonly (readonly [number, string])[] = [
  [400, '#F6F2EA'],
  [320, '#1B140F'],
  [240, '#2F6BEA'],
  [160, '#E0453A'],
  [80, '#F2C230'],
];

/** The target face as flat SVG (millimetres from the centre, y up): the flat view without WebGL, and the Art tile. */
export function ArcheryTargetSvg({
  arrows = [],
  mineId = null,
  sight = null,
  size = '100%',
}: {
  arrows?: readonly Pick<ArrowRecord, 'x' | 'y' | 'by'>[];
  mineId?: string | null;
  sight?: { x: number; y: number } | null;
  size?: number | string;
}) {
  return (
    <Svg width={size} height={size} viewBox="-700 -700 1400 1400">
      {RINGS.map(([r, c]) => (
        <Circle key={r} r={r} fill={c} />
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <Circle
          key={i}
          r={40 * (i + 1)}
          fill="none"
          stroke={i >= 4 && i <= 7 ? '#FFFFFF' : '#2A1A10'}
          strokeOpacity={0.55}
          strokeWidth={3}
        />
      ))}
      {arrows.map((a, i) => (
        <Circle
          key={i}
          cx={a.x}
          cy={-a.y}
          r={18}
          fill={a.by === mineId ? '#F2C230' : '#E0453A'}
          stroke="#FFFFFF"
          strokeWidth={5}
        />
      ))}
      {sight ? (
        <G>
          <Circle cx={sight.x} cy={-sight.y} r={44} fill="none" stroke="#FFFFFF" strokeWidth={9} />
          <Line
            x1={sight.x - 80}
            x2={sight.x + 80}
            y1={-sight.y}
            y2={-sight.y}
            stroke="#FFFFFF"
            strokeWidth={5}
          />
          <Line
            x1={sight.x}
            x2={sight.x}
            y1={-sight.y - 80}
            y2={-sight.y + 80}
            stroke="#FFFFFF"
            strokeWidth={5}
          />
        </G>
      ) : null}
    </Svg>
  );
}
