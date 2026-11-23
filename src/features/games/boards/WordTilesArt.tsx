import { StyleSheet, View } from 'react-native';
import { Text } from '@dyce/ui';
import { Gradient } from '@/components/Gradient';
import type { ArtProps } from '../registry/types';

/** A few tiles crossing on the green table: WORD across and TILE down, sharing the T (design: PlayScrabble). */
const ACROSS = ['W', 'O', 'R', 'D'] as const;
const DOWN = ['T', 'I', 'L', 'E'] as const;

/**
 * The picture for Word Tiles: the drawer tile, the chat card and the results hero. Plain views only, so
 * it is cheap in every chat card. `dice` is the size hint the other game art uses (a tile is that wide).
 */
export function WordTilesArt({ style, compact, dice, hero }: ArtProps) {
  const t = Math.max(12, Math.round((dice ?? (hero ? 26 : compact ? 18 : 24)) * 1));
  const gap = Math.max(1, Math.round(t * 0.08));
  const tile = (ch: string, key: string, x: number, y: number, hot?: boolean) => (
    <View
      key={key}
      style={[
        styles.tile,
        {
          left: x * (t + gap),
          top: y * (t + gap),
          width: t,
          height: t,
          borderRadius: t * 0.16,
          backgroundColor: hot ? '#FFD9A0' : '#FFF0CC',
          boxShadow: `0px ${Math.max(1, Math.round(t * 0.1))}px 0px #A57A3C`,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontFamily: 'BricolageGrotesque_800ExtraBold',
          fontSize: t * 0.6,
          color: '#3A2A14',
        }}
      >
        {ch}
      </Text>
    </View>
  );
  const w = 4 * t + 3 * gap;
  return (
    <Gradient
      radius={hero ? 22 : 0}
      radial={{ cx: 0.5, cy: 0.4 }}
      stops={[
        [0, '#2E6A52'],
        [0.9, '#0C1712'],
      ]}
      style={[styles.root, hero ? styles.hero : null, style]}
    >
      <View aria-hidden style={{ width: w, height: w }}>
        {ACROSS.map((ch, i) => tile(ch, `a${i}`, i, 0, false))}
        {DOWN.slice(1).map((ch, i) => tile(ch, `d${i}`, 0, i + 1, false))}
      </View>
    </Gradient>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hero: { width: 150, height: 120 },
  tile: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
