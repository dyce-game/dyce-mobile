import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Icon, Text, useTheme } from '@dyce/ui';

/**
 * Header for pushed (non-tab) screens: back arrow, title, optional trailing action. `fallback` is where
 * Back goes when there is nothing to go back to (e.g. the screen was opened directly by URL).
 */
export function ScreenHeader({
  title,
  right,
  fallback = '/chat',
}: {
  title: string;
  right?: ReactNode;
  fallback?: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as Href))}
        style={styles.side}
      >
        <Icon name="back" color={colors.text} />
      </Pressable>
      <Text variant="headline" accessibilityRole="header" style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 8 },
  side: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
});
