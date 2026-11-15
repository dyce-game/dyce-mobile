import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '@dyce/ui';

/**
 * The two soft glows behind the tab screens (design: a 320pt amber circle top-left and a 300pt ember one on the
 * right, each fading to nothing at 70%). Decorative and non-interactive; sits behind everything.
 */
export function Glow() {
  const { colors } = useTheme();
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={styles.fill} pointerEvents="none" aria-hidden>
      <Svg width="100%" height={340} style={styles.svg}>
        <Defs>
          <RadialGradient id={`${id}a`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.glowA} />
            <Stop offset="0.7" stopColor={colors.glowA} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={80} cy={40} r={160} fill={`url(#${id}a)`} />
      </Svg>
      <Svg width={300} height={300} style={styles.right}>
        <Defs>
          <RadialGradient id={`${id}c`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.glowB} />
            <Stop offset="0.7" stopColor={colors.glowB} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={150} cy={150} r={150} fill={`url(#${id}c)`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  svg: { position: 'absolute', left: 0, top: 0 },
  right: { position: 'absolute', right: -120, top: 40 },
});
