import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { brand } from '@dyce/ui';
import { WordHuntArt } from '../boards/WordHuntArt';
import { DieFace } from './DieFace';

/**
 * The picture for a game: the tile in the drawer, the top of a card in a chat. Pig is two dice on felt.
 * Games without art of their own yet get a plain felt panel. (Video thumbnails come with the catalogue.)
 */
export function GameArt({
  slug,
  style,
  compact,
  dice,
}: {
  slug: string;
  style?: StyleProp<ViewStyle>;
  /** The smaller layout used on chat cards. */
  compact?: boolean;
  /** Die size in points, to fit a very small frame. */
  dice?: number;
}) {
  const size = dice ?? (compact ? 38 : 50);
  if (slug === 'word-hunt') return <WordHuntArt size={size} style={style} end={compact} />;
  return (
    <View aria-hidden style={[styles.felt, style]}>
      {slug === '_example' ? (
        <>
          <DieFace value={5} size={size} rotate={-12} />
          <View style={{ marginTop: size * 0.5 }}>
            <DieFace value={3} size={size} rotate={14} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  felt: {
    backgroundColor: brand.felt.fill,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
