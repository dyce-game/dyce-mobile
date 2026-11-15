import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '@dyce/ui';

/**
 * A bottom sheet over a dimmed screen (design: SendMoney, RequestMoney): rounded 26pt top corners, a grabber,
 * 16pt sides. Tapping the dim area closes it. Rendered by routes presented as transparent modals.
 */
export function SheetFrame({
  label,
  onClose,
  children,
}: {
  /** Names the sheet for screen readers ("Send Dyce Cash"). */
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, styles.dim]}
      />
      <View accessibilityLabel={label} style={[styles.sheet, { backgroundColor: colors.bg }]}>
        <View style={[styles.grabber, { backgroundColor: colors.line }]} />
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  dim: { backgroundColor: 'rgba(0,0,0,0.32)' },
  sheet: {
    maxHeight: '94%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center' },
  body: { paddingTop: 12, paddingBottom: 10, gap: 8 },
});
