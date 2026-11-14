import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme.tsx';

/**
 * Glass surface: expo-blur (intensity ~40, light/dark tint) + glass fill + 1px edge + floating shadow.
 * DESIGN_SYSTEM.md "Shape and depth". The outer view carries size/shadow; the inner view fills it.
 */
export function Glass({
  children,
  radius = 34,
  intensity = 40,
  style,
}: {
  children?: ReactNode;
  radius?: number;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        // boxShadow (RN new architecture) renders on iOS, Android and web, unlike shadow* on a translucent view.
        { borderRadius: radius, boxShadow: `0px 8px 18px ${colors.glassShadow}` },
        style,
      ]}
    >
      <View style={[styles.clip, { borderRadius: radius, borderColor: colors.glassEdge }]}>
        <BlurView
          intensity={intensity}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { flex: 1, overflow: 'hidden', borderWidth: 1 },
});
