import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { Text } from './Text.tsx';
import { useTheme } from '../theme.tsx';

/**
 * A round avatar. Pass the picture as `source` (the app maps a player's saved look to an image); without one it
 * shows the first letter of `name` on a soft ember circle, so a player who hasn't picked a look still has a face.
 *
 * Decorative: the row or button around it carries the accessible label.
 */
export function Avatar({
  size = 44,
  source,
  name,
}: {
  size?: number;
  source?: ImageSourcePropType | null;
  name: string;
}) {
  const { colors } = useTheme();
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (source) {
    return (
      <Image
        source={source}
        style={[box, { backgroundColor: colors.chip }]}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        aria-hidden
      />
    );
  }
  return (
    <View style={[styles.fallback, box, { backgroundColor: colors.brandSoft }]} aria-hidden>
      <Text
        variant="callout"
        color="accent"
        style={{ fontSize: Math.max(12, Math.round(size * 0.4)) }}
      >
        {name.trim().slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ fallback: { alignItems: 'center', justifyContent: 'center' } });
