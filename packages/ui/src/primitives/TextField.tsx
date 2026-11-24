import { useRef, useState, type ElementRef, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { Text } from './Text.tsx';
import { useTheme } from '../theme.tsx';
import { brand, MAX_FONT_SCALE, radii } from '../tokens.ts';

export type TextFieldProps = Pick<
  TextInputProps,
  | 'value'
  | 'onChangeText'
  | 'placeholder'
  | 'keyboardType'
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'autoComplete'
  | 'textContentType'
  | 'maxLength'
  | 'autoFocus'
  | 'onSubmitEditing'
  | 'returnKeyType'
  | 'editable'
  | 'testID'
> & {
  label: string;
  /** Helper text under the field. */
  hint?: string;
  /** Error text under the field; also turns the border red-ember. Announced to screen readers. */
  error?: string;
  /** Content before the input (a country button, an "@"). */
  leading?: ReactNode;
  /** Content after the input (a status icon). */
  trailing?: ReactNode;
  /** Defaults to `label`. */
  accessibilityLabel?: string;
};

/**
 * Themed text input (56pt tall, 16 radius). Focus shows a 2px ember border; errors show text, not
 * just colour. Label is always visible (never a placeholder-only field).
 */
export function TextField({
  label,
  hint,
  error,
  leading,
  trailing,
  accessibilityLabel,
  ...input
}: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<ElementRef<typeof TextInput>>(null);
  const borderColor = error ? colors.accent : focused ? brand.ember.fill : 'transparent';
  return (
    <View style={styles.wrap}>
      {/* Tapping the visible label focuses the field. The input already carries the label for screen readers,
          so this tap target is hidden from them (and from the tab order) rather than read twice. */}
      <Pressable
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        focusable={false}
        onPress={() => inputRef.current?.focus()}
      >
        <Text variant="footnote" color="sub">
          {label}
        </Text>
      </Pressable>
      <View style={[styles.field, { backgroundColor: colors.chip, borderColor }]}>
        {leading}
        <TextInput
          {...input}
          ref={inputRef}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={colors.sub}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, webNoOutline, { color: colors.text }]}
        />
        {trailing}
      </View>
      {error ? (
        <Text variant="footnote" color="accent" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" color="sub">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  field: {
    minHeight: 56,
    borderRadius: radii.chip,
    borderWidth: 2,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Figtree_600SemiBold',
    fontSize: 18,
    paddingVertical: 12,
  },
});

// The wrapper draws the focus ring (2px ember border), so suppress the browser's own outline on web.
// react-native-web accepts outlineStyle "none"; React Native's types don't list it, hence the cast.
const webNoOutline: TextStyle | undefined =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : undefined;
