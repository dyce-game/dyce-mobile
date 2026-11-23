import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { brand } from '@dyce/ui';
import { gameEntry } from '../registry';

/**
 * The picture for a game: the tile in the drawer, the top of a card in a chat. The picture itself comes from
 * the game's registry entry (`Art`); a game without one yet gets a plain felt panel. (Video thumbnails come
 * with the catalogue.) Nothing here changes when a game is added.
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
  /** A size hint in points for the main shape, to fit a very small frame. */
  dice?: number;
}) {
  const Art = gameEntry(slug)?.Art;
  if (Art) return <Art style={style} compact={compact} dice={dice} />;
  return <View aria-hidden style={[styles.felt, style]} />;
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
