import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import {
  EIGHT_BALL_BALL_R,
  EIGHT_BALL_POCKETS,
  EIGHT_BALL_TABLE_L,
  EIGHT_BALL_TABLE_W,
} from '@dyce/games';
import { BALL_COLORS, DMM, type AimGuide, type Ball } from './eight-ball-logic';

const W = EIGHT_BALL_TABLE_W;
const L = EIGHT_BALL_TABLE_L;
const PAD = 120;

/** The table seen from above, upright like the 3D view (the head end at the bottom, the engine's +y to the left). */
const sx = (yMm: number) => PAD + (W - yMm);
const sy = (xMm: number) => PAD + (L - xMm);

/**
 * The flat view of the table: used when there is no WebGL, and the same picture the sliders drive. Plain SVG,
 * no canvas, no animation; it always shows the table as the server has it.
 */
export function EightBallFlat({
  balls,
  guide,
  calledPocket,
  headLine,
}: {
  balls: readonly Ball[];
  guide: AimGuide | null;
  calledPocket: number | null;
  headLine: boolean;
}) {
  return (
    <View style={styles.root}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W + 2 * PAD} ${L + 2 * PAD}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <Rect x={PAD - 90} y={PAD - 90} width={W + 180} height={L + 180} rx={60} fill="#6B3A1C" />
        <Rect x={PAD - 30} y={PAD - 30} width={W + 60} height={L + 60} rx={20} fill="#0C5A38" />
        <Rect x={PAD} y={PAD} width={W} height={L} fill="#13824F" />
        {headLine ? (
          <Line
            x1={PAD}
            x2={PAD + W}
            y1={sy(560)}
            y2={sy(560)}
            stroke="#FFFFFF"
            strokeOpacity={0.5}
            strokeWidth={5}
          />
        ) : null}
        {EIGHT_BALL_POCKETS.map((p, i) => (
          <Circle
            key={i}
            cx={sx(p.y)}
            cy={sy(p.x)}
            r={p.r}
            fill="#030201"
            stroke={calledPocket === i ? '#FFD24A' : 'none'}
            strokeWidth={14}
          />
        ))}
        {guide ? (
          <>
            <Line
              x1={sx(guide.from.y)}
              y1={sy(guide.from.x)}
              x2={sx(guide.to.y)}
              y2={sy(guide.to.x)}
              stroke="#FFFFFF"
              strokeOpacity={0.8}
              strokeWidth={8}
            />
            {guide.hitId !== null ? (
              <Circle
                cx={sx(guide.to.y)}
                cy={sy(guide.to.x)}
                r={EIGHT_BALL_BALL_R}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={6}
              />
            ) : null}
          </>
        ) : null}
        {balls.map((b) => {
          const cx = sx(b.y / DMM);
          const cy = sy(b.x / DMM);
          const color = BALL_COLORS[b.id] ?? '#FFFFFF';
          const stripe = b.id >= 9;
          return (
            <Circle
              key={b.id}
              cx={cx}
              cy={cy}
              r={EIGHT_BALL_BALL_R}
              fill={stripe ? '#F6F2EA' : color}
              stroke="#00000055"
              strokeWidth={3}
            />
          );
        })}
        {balls
          .filter((b) => b.id >= 9)
          .map((b) => (
            <Circle
              key={`s${b.id}`}
              cx={sx(b.y / DMM)}
              cy={sy(b.x / DMM)}
              r={EIGHT_BALL_BALL_R * 0.62}
              fill={BALL_COLORS[b.id]}
            />
          ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, paddingTop: 70, paddingBottom: 150 } });
