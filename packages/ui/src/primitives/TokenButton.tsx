import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Icon, type IconName } from '../icons/Icon.tsx';
import { Text } from './Text.tsx';
import { useTheme } from '../theme.tsx';
import { brand, MIN_TOUCH, motion, radii, type BrandName } from '../tokens.ts';

export type ButtonTone = BrandName | 'chip';

export type TokenButtonProps = {
  label: string;
  onPress?: () => void;
  tone?: ButtonTone;
  icon?: IconName;
  disabled?: boolean;
  /** Defaults to `label`. Provide one when the label alone isn't descriptive. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const EDGE = 3;

/**
 * Chunky "token" button: solid fill + 3px solid bottom edge + inset top highlight. On press it drops 2px
 * (edge shrinks to 1px) over 90ms and gives a light haptic. Min touch target 44pt.
 */
export function TokenButton({
  label,
  onPress,
  tone = 'ember',
  icon,
  disabled,
  accessibilityLabel,
  style,
}: TokenButtonProps) {
  const { colors } = useTheme();
  const pressed = useSharedValue(0);
  const palette =
    tone === 'chip' ? { fill: colors.chip, edge: colors.chipEdge, text: colors.text } : brand[tone];

  const face = useAnimatedStyle(() => ({ transform: [{ translateY: pressed.value * 2 }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: motion.pressMs });
        if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: motion.pressMs });
      }}
      onPress={onPress}
      style={[{ opacity: disabled ? 0.5 : 1 }, style]}
    >
      <View style={[styles.edge, { backgroundColor: palette.edge, paddingBottom: EDGE }]}>
        <Animated.View style={[styles.face, { backgroundColor: palette.fill }, face]}>
          <View pointerEvents="none" style={styles.highlight} />
          {icon ? <Icon name={icon} size={20} color={palette.text} /> : null}
          <Text variant="callout" style={{ color: palette.text }}>
            {label}
          </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  edge: { borderRadius: radii.button },
  face: {
    minHeight: MIN_TOUCH,
    borderRadius: radii.button,
    paddingHorizontal: 22,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
});
