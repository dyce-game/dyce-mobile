import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@dyce/ui';

/**
 * Placeholder avatar: the first letter on a soft ember circle. Replaced by the real <Avatar> when the
 * avatar system lands; screens only need to swap this one component.
 */
export function InitialAvatar({ name, size = 44 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brandSoft },
      ]}
      aria-hidden
    >
      <Text variant="callout" color="accent">
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ circle: { alignItems: 'center', justifyContent: 'center' } });
