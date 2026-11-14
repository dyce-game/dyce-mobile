import { useEffect } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Text } from './Text.tsx';
import { useTheme } from '../theme.tsx';
import { brand, MAX_FONT_SCALE } from '../tokens.ts';

export type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  /** Increment to play the "wrong code" shake (and keep the boxes red until the next edit). */
  errorSignal?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  accessibilityLabel?: string;
};

/**
 * One real, full-size TextInput (so iOS `oneTimeCode` and Android autofill work, and paste works)
 * drawn as separate boxes. Digits only; fires `onChange` with the cleaned value.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  errorSignal = 0,
  disabled,
  autoFocus,
  accessibilityLabel = 'Verification code',
}: OtpInputProps) {
  const { colors } = useTheme();
  const shake = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (errorSignal > 0 && !reduceMotion) {
      shake.value = withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 80 }),
        withTiming(-6, { duration: 80 }),
        withTiming(6, { duration: 80 }),
        withTiming(0, { duration: 50 }),
      );
    }
  }, [errorSignal, reduceMotion, shake]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const hasError = errorSignal > 0 && value.length < length;
  const cells = Array.from({ length }, (_, i) => value[i] ?? '');
  const active = Math.min(value.length, length - 1);

  return (
    <Animated.View style={[styles.row, style]}>
      {/* The boxes are decoration: the TextInput below overlays them, receives taps and is what screen readers see. */}
      <View style={styles.row} aria-hidden>
        {cells.map((digit, i) => (
          <View
            key={i}
            style={[
              styles.cell,
              {
                backgroundColor: colors.chip,
                borderColor: hasError
                  ? colors.accent
                  : i === active
                    ? brand.ember.fill
                    : 'transparent',
              },
            ]}
          >
            <Text variant="title">{digit}</Text>
          </View>
        ))}
      </View>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        editable={!disabled}
        caretHidden
        accessibilityLabel={accessibilityLabel}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        // Invisible but real and full-size: it receives focus, paste and SMS autofill.
        style={styles.hidden}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  cell: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.02,
    fontSize: 1,
  },
});
