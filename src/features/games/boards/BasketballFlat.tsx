import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';
import { BASKETBALL_RACKS } from '@dyce/games';

/**
 * The court from above, drawn flat: used when there is no WebGL. The hoop, the arc, the five rack spots (the
 * current one marked), and the sliders still set the shot. Plain SVG, no canvas, no animation.
 */
export function BasketballFlat({ rack, money }: { rack: number; money: boolean }) {
  // Floor plan in metres: x right, the hoop at the origin, the shooters towards the bottom.
  const X = (mm: number) => 8 + mm / 1000;
  const Y = (mm: number) => 2.4 - mm / 1000;
  return (
    <View style={styles.root}>
      <Svg width="100%" height="100%" viewBox="0 0 16 11" preserveAspectRatio="xMidYMid meet">
        <Rect x={0} y={0} width={16} height={11} fill="#C98A4E" />
        <Rect
          x={X(-2450)}
          y={Y(1600)}
          width={4.9}
          height={Y(-4200) - Y(1600)}
          fill="#C93E1C"
          opacity={0.5}
        />
        <Path
          d={`M ${X(-6750)} ${Y(0)} A 6.75 6.75 0 0 0 ${X(6750)} ${Y(0)}`}
          stroke="#FFFFFF"
          strokeWidth={0.08}
          fill="none"
        />
        <Line
          x1={X(-900)}
          x2={X(900)}
          y1={Y(380)}
          y2={Y(380)}
          stroke="#FFFFFF"
          strokeWidth={0.12}
        />
        <Circle cx={X(0)} cy={Y(0)} r={0.23} stroke="#E8701E" strokeWidth={0.06} fill="none" />
        {BASKETBALL_RACKS.map((r, i) => (
          <Ellipse
            key={i}
            cx={X(r.x)}
            cy={Y(r.z)}
            rx={0.4}
            ry={0.4}
            fill="none"
            stroke={i === rack ? (money ? '#FFD24A' : '#E3A93B') : '#FFFFFF'}
            strokeOpacity={i === rack ? 1 : 0.4}
            strokeWidth={i === rack ? 0.16 : 0.08}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 130, paddingBottom: 190, backgroundColor: '#0E1424' },
});
