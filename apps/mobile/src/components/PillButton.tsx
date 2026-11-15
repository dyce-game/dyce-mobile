import { Pressable, StyleSheet } from 'react-native';
import { Text, brand, useTheme } from '@dyce/ui';

export type PillButtonProps = {
  label: string;
  onPress: () => void;
  /** "primary" is the ember token style; "neutral" is a quiet chip; "danger" is for destructive confirms. */
  tone?: 'primary' | 'neutral' | 'danger';
  disabled?: boolean;
  /** Shows "…" and ignores presses. */
  busy?: boolean;
  /** Defaults to `label`; say who it acts on ("Accept @tunde.o"). */
  accessibilityLabel?: string;
};

/** Compact action button used in list rows. 44pt minimum touch target. */
export function PillButton({
  label,
  onPress,
  tone = 'neutral',
  disabled,
  busy,
  accessibilityLabel,
}: PillButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || busy;
  const palette =
    tone === 'primary'
      ? { bg: brand.ember.fill, edge: brand.ember.edge, text: brand.ember.text }
      : tone === 'danger'
        ? { bg: colors.accent, edge: colors.accent, text: colors.bg }
        : { bg: colors.chip, edge: colors.chipEdge, text: colors.text };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive }}
      disabled={inactive}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: palette.bg, borderBottomColor: palette.edge },
        disabled ? { backgroundColor: colors.chip, borderBottomColor: colors.chip } : null,
        busy ? { opacity: 0.6 } : null,
      ]}
    >
      <Text variant="callout" style={{ color: disabled ? colors.sub : palette.text }}>
        {busy ? '…' : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
