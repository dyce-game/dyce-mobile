import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { DartboardSvg } from './DartboardSvg';

/**
 * The picture for Darts: the drawer tile, the chat card and the result. The board on a dark wooden wall with
 * two darts in the treble 20 and the bull. Plain SVG (no canvas).
 */
export function DartsArt({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View aria-hidden style={[styles.root, style]}>
      <DartboardSvg
        numbers={false}
        darts={[
          { x: 0, y: 1300 },
          { x: -230, y: 80 },
        ]}
        size="130%"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A1A10',
  },
});
