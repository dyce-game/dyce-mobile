import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme.tsx';

/** Themed screen background. `scroll` wraps content in a ScrollView with room for the floating TabBar. */
export function Screen({
  children,
  scroll,
  style,
  bottomInset = 0,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  bottomInset?: number;
}) {
  const { colors } = useTheme();
  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={[styles.content, { paddingBottom: 24 + bottomInset }, style]}
        contentInsetAdjustmentBehavior="automatic"
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, styles.content, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({ content: { padding: 20, gap: 16 } });
