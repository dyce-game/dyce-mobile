import { StyleSheet, View } from 'react-native';
import { PIPS } from '../ludo-logic';

/**
 * A flat die face for the HUD (the roll button and the "you rolled a 5" line): a white rounded square with
 * pips. Decorative; the number is always in the text next to it, so it is hidden from a screen reader.
 */
export function DieFace({ value, size = 30 }: { value: number; size?: number }) {
  const pips = PIPS[value] ?? PIPS[1]!;
  const pip = Math.max(4, Math.round(size * 0.17));
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.face, { width: size, height: size, borderRadius: size * 0.24 }]}
    >
      {pips.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: pip,
            height: pip,
            borderRadius: pip / 2,
            backgroundColor: '#1B140F',
            left: size / 2 + p[0] * size * 0.62 - pip / 2,
            top: size / 2 + p[1] * size * 0.62 - pip / 2,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ face: { backgroundColor: '#FFFFFF' } });
