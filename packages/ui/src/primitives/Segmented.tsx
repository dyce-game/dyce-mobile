import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text.tsx';
import { useTheme } from '../theme.tsx';

/**
 * A row of 2-4 options in a recessed track, the chosen one raised on a card (Settings "who can message me",
 * Spaces | People). Each option is a radio: colour is never the only signal because the chosen one is also bolder.
 */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.track, { backgroundColor: colors.chip }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={[styles.option, on ? { backgroundColor: colors.card } : null]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.text,
                {
                  color: colors.text,
                  fontFamily: on ? 'Figtree_700Bold' : 'Figtree_600SemiBold',
                },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 3, borderRadius: 12, gap: 3 },
  option: {
    flex: 1,
    minHeight: 44,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 14 },
});
