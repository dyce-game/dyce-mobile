import { StyleSheet, View } from 'react-native';

/** Pip positions on a 3x3 grid (column, row) for each face. */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

/** A die face drawn with views (no emoji, no image). `value` 1-6. Decorative: the caller labels it. */
export function DieFace({
  value,
  size = 56,
  fill = '#FFFFFF',
  pip = '#1B140F',
  rotate = 0,
}: {
  value: number;
  size?: number;
  fill?: string;
  pip?: string;
  rotate?: number;
}) {
  const pad = size * 0.16;
  const cell = (size - pad * 2) / 3;
  const dot = cell * 0.74;
  return (
    <View
      aria-hidden
      style={[
        styles.die,
        {
          width: size,
          height: size,
          borderRadius: size * 0.24,
          backgroundColor: fill,
          transform: [{ rotate: `${rotate}deg` }],
        },
      ]}
    >
      {(PIPS[value] ?? []).map(([c, r], i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: pad + c * cell + (cell - dot) / 2,
            top: pad + r * cell + (cell - dot) / 2,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: pip,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  die: { boxShadow: '0px 2px 0px rgba(0,0,0,0.25)' },
});
