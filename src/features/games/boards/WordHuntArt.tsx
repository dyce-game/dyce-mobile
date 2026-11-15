import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@dyce/ui';
import { Gradient } from '@/components/Gradient';

/** Three rows of letters; the top row is the traced word (design: PlayWordHunt). */
const ROWS = ['WORD', 'HUNT', 'FIND'] as const;

/**
 * The picture for Word Hunt: the drawer tile, the chat card and the small icon in the mode sheet. A few
 * letter tiles on the amber table, the top row picked out in ember. `size` is the same hint the other
 * game art uses (die size); tiles are half of it.
 */
export function WordHuntArt({
  size,
  style,
  end,
}: {
  size: number;
  style?: StyleProp<ViewStyle>;
  /** Push the tiles to the right edge, clear of the badges on a chat card. */
  end?: boolean;
}) {
  const cell = Math.max(8, Math.round(size * 0.5));
  const gap = Math.max(2, Math.round(cell * 0.14));
  return (
    <Gradient
      radius={0}
      radial={{ cx: 0.5, cy: 0.4 }}
      stops={[
        [0, '#5A3600'],
        [0.9, '#1A0F00'],
      ]}
      style={[styles.root, end ? styles.end : null, style]}
    >
      <View aria-hidden style={{ gap }}>
        {ROWS.map((row, r) => (
          <View key={row} style={{ flexDirection: 'row', gap }}>
            {row.split('').map((ch, c) => {
              const on = r === 0;
              return (
                <View
                  key={c}
                  style={{
                    width: cell,
                    height: cell,
                    borderRadius: cell * 0.24,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? '#E4572E' : '#FBF1DD',
                    boxShadow: `0px ${Math.max(1, Math.round(cell * 0.12))}px 0px ${on ? '#8A2410' : '#B9A57E'}`,
                  }}
                >
                  <Text
                    allowFontScaling={false}
                    style={{
                      fontFamily: 'BricolageGrotesque_800ExtraBold',
                      fontSize: cell * 0.6,
                      color: on ? '#FFFFFF' : '#5A3600',
                    }}
                  >
                    {ch}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </Gradient>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  end: { alignItems: 'flex-end', paddingRight: 14 },
});
