import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@dyce/ui';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const;

/** The amount keypad (design: SendMoney): 3 x 4, 54pt keys, "00" and delete. */
export function Keypad({ onPress }: { onPress: (key: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.grid}>
      {KEYS.map((k) => (
        <Pressable
          key={k}
          accessibilityRole="button"
          accessibilityLabel={k === 'del' ? 'Delete' : k}
          onPress={() => onPress(k)}
          style={styles.key}
        >
          <Text style={[styles.label, { color: colors.text }]}>{k === 'del' ? '⌫' : k}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  key: {
    width: '31.9%',
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 26, fontFamily: 'Figtree_600SemiBold' },
});
