import { StyleSheet, View } from 'react-native';
import { DartboardSvg } from './DartboardSvg';
import type { Point } from './darts-logic';

/** The board seen straight on, drawn flat: used when there is no WebGL. The sliders move the aim marker. */
export function DartsFlat({ darts, aim }: { darts: readonly Point[]; aim: Point | null }) {
  return (
    <View style={styles.root}>
      <DartboardSvg darts={darts} aim={aim} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 130,
    paddingBottom: 170,
    paddingHorizontal: 20,
    backgroundColor: '#1E120A',
  },
});
