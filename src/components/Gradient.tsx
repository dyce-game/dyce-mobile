import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

type Stops = readonly (readonly [offset: number, color: string])[];

/**
 * A rounded surface filled with a gradient, with content on top. Used for the Wallet balance card, the Top-up
 * hero and the "money sent to you" chat card. `radial` centres on (cx, cy) as fractions of the box (the
 * design's `radial-gradient(circle at 85% 10%, ...)`); `linear` runs corner to corner (135deg).
 */
export function Gradient({
  stops,
  radius,
  radial,
  style,
  children,
}: {
  stops: Stops;
  radius: number;
  radial?: { cx: number; cy: number };
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  // SVG ids are document-global on web: every instance needs its own.
  const id = `grad${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={[styles.box, { borderRadius: radius }, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          {radial ? (
            <RadialGradient
              id={id}
              cx={radial.cx}
              cy={radial.cy}
              r="1"
              fx={radial.cx}
              fy={radial.cy}
            >
              {stops.map(([o, c]) => (
                <Stop key={o} offset={o} stopColor={c} />
              ))}
            </RadialGradient>
          ) : (
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              {stops.map(([o, c]) => (
                <Stop key={o} offset={o} stopColor={c} />
              ))}
            </LinearGradient>
          )}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ box: { overflow: 'hidden' } });
