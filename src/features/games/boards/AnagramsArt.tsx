import { StyleSheet, View } from 'react-native';
import { Text } from '@dyce/ui';
import { Gradient } from '@/components/Gradient';
import type { ArtProps } from '../registry/types';

/** One row of six letter tiles on the walnut table; the first three are "picked" in ember (design: PlayAnagrams). */
const LETTERS = ['G', 'A', 'N', 'R', 'O', 'E'] as const;

/**
 * The picture for Anagrams: the drawer tile, the chat card and the results hero. Light on purpose (plain
 * views): it renders in every chat card. `dice` is the size hint the other game art uses.
 */
export function AnagramsArt({ style, compact, dice, hero }: ArtProps) {
  const size = dice ?? (hero ? 26 : compact ? 20 : 28);
  const gap = Math.max(2, Math.round(size * 0.14));
  const rows = compact ? [LETTERS] : [LETTERS.slice(3), LETTERS.slice(0, 3)];
  return (
    <Gradient
      radius={hero ? 22 : 0}
      radial={{ cx: 0.5, cy: 0.4 }}
      stops={[
        [0, '#5A3A22'],
        [0.9, '#1A0F08'],
      ]}
      style={[styles.root, hero ? styles.hero : null, style]}
    >
      <View aria-hidden style={{ gap }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap }}>
            {row.map((ch, c) => {
              const on = !compact && r === 1;
              return (
                <View
                  key={`${r}${c}`}
                  style={{
                    width: size,
                    height: size * 1.12,
                    borderRadius: size * 0.2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? '#E4572E' : '#FBF1DD',
                    boxShadow: `0px ${Math.max(1, Math.round(size * 0.1))}px 0px ${on ? '#8A2410' : '#B9A57E'}`,
                  }}
                >
                  <Text
                    allowFontScaling={false}
                    style={{
                      fontFamily: 'BricolageGrotesque_800ExtraBold',
                      fontSize: size * 0.58,
                      color: on ? '#FFFFFF' : '#3A2A14',
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
  root: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hero: { width: 150, height: 120 },
});
