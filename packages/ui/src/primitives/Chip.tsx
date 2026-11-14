import { Pressable, StyleSheet } from 'react-native';
import { Text } from './Text.tsx';
import { useTheme } from '../theme.tsx';
import { MIN_TOUCH, radii } from '../tokens.ts';

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.brandSoft : colors.chip,
          borderColor: selected ? colors.accent : 'transparent',
        },
      ]}
    >
      <Text variant="callout" color={selected ? 'accent' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: 16,
    borderRadius: radii.chip,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
