import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, brand, useTheme } from '@dyce/ui';
import { AUTH_STEP_COUNT } from '../routes';

/** Back arrow + "Step n of 3" dots, as in the Phone / Username designs. */
export function AuthHeader({
  step,
  onBack,
  right,
}: {
  step: 1 | 2 | 3;
  onBack?: () => void;
  /** Optional trailing control, e.g. a "Skip" link. */
  right?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.side}
        >
          <Icon name="back" color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.side} />
      )}
      <View
        style={styles.dots}
        accessible
        accessibilityLabel={`Step ${step} of ${AUTH_STEP_COUNT}`}
      >
        {Array.from({ length: AUTH_STEP_COUNT }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i + 1 === step ? styles.dotActive : null,
              { backgroundColor: i + 1 <= step ? brand.ember.fill : colors.line },
            ]}
          />
        ))}
      </View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 },
  side: { minWidth: 44, height: 44, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 22 },
});
