import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { DARTS_SECTORS } from '@dyce/games';
import { RING_R, numberSpots, type Point } from './darts-logic';

/** The dartboard as flat SVG (millimetres from the bull): the flat view without WebGL, and the Art tile. */
const MM = 1000;
const R = (m: number) => m * MM;

const P = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [Math.sin(a) * r, -Math.cos(a) * r];
};

function wedge(r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = P(r1, a0);
  const [x1, y1] = P(r1, a1);
  const [x2, y2] = P(r0, a1);
  const [x3, y3] = P(r0, a0);
  return `M${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3} Z`;
}

export function DartboardSvg({
  darts = [],
  aim = null,
  numbers = true,
  size = '100%',
}: {
  /** Darts in the board, engine units (0.1 mm, y up). */
  darts?: readonly Point[];
  aim?: Point | null;
  numbers?: boolean;
  size?: number | string;
}) {
  const edge = R(0.26);
  const toSvg = (p: Point): [number, number] => [p.x / 10, -p.y / 10];
  return (
    <Svg width={size} height={size} viewBox={`${-edge} ${-edge} ${edge * 2} ${edge * 2}`}>
      <Circle r={edge} fill="#3A2414" />
      <Circle r={R(0.215)} fill="#0E0C0B" />
      {DARTS_SECTORS.map((n, i) => {
        const a0 = i * 18 - 9;
        const a1 = i * 18 + 9;
        const even = i % 2 === 0;
        const ring = even ? '#C62828' : '#1E7A3E';
        const single = even ? '#151515' : '#EFE3C2';
        return (
          <G key={n}>
            <Path d={wedge(R(RING_R.doubleIn), R(RING_R.doubleOut), a0, a1)} fill={ring} />
            <Path d={wedge(R(RING_R.tripleOut), R(RING_R.doubleIn), a0, a1)} fill={single} />
            <Path d={wedge(R(RING_R.tripleIn), R(RING_R.tripleOut), a0, a1)} fill={ring} />
            <Path d={wedge(R(RING_R.bull), R(RING_R.tripleIn), a0, a1)} fill={single} />
          </G>
        );
      })}
      <Circle r={R(RING_R.bull)} fill="#1E7A3E" />
      <Circle r={R(RING_R.dbull)} fill="#C62828" />
      {[RING_R.doubleOut, RING_R.doubleIn, RING_R.tripleOut, RING_R.tripleIn, RING_R.bull].map(
        (r) => (
          <Circle key={r} r={R(r)} fill="none" stroke="#C9C9C9" strokeWidth={1} />
        ),
      )}
      {numbers
        ? numberSpots().map((s) => (
            <SvgText
              key={s.n}
              x={s.x * MM}
              y={-s.y * MM + 7}
              fill="#EDE6D6"
              fontSize={21}
              fontWeight="700"
              textAnchor="middle"
            >
              {s.n}
            </SvgText>
          ))
        : null}
      {darts.map((d, i) => {
        const [x, y] = toSvg(d);
        return (
          <Circle key={i} cx={x} cy={y} r={6} fill="#C93E1C" stroke="#FFFFFF" strokeWidth={2} />
        );
      })}
      {aim
        ? (() => {
            const [x, y] = toSvg(aim);
            return (
              <G>
                <Circle cx={x} cy={y} r={12} fill="none" stroke="#FFFFFF" strokeWidth={3} />
                <Line x1={x - 20} x2={x + 20} y1={y} y2={y} stroke="#FFFFFF" strokeWidth={2} />
                <Line x1={x} x2={x} y1={y - 20} y2={y + 20} stroke="#FFFFFF" strokeWidth={2} />
              </G>
            );
          })()
        : null}
    </Svg>
  );
}
