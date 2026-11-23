import { StyleSheet, View } from 'react-native';
import { ArcheryTargetSvg } from './ArcheryTargetSvg';
import type { ArrowRecord } from './archery-logic';

/** The target face straight on, drawn flat: used when there is no WebGL. The sliders move the sight. */
export function ArcheryFlat({
  arrows,
  mineId,
  sight,
}: {
  arrows: readonly ArrowRecord[];
  mineId: string;
  sight: { x: number; y: number } | null;
}) {
  return (
    <View style={styles.root}>
      <ArcheryTargetSvg arrows={arrows} mineId={mineId} sight={sight} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 150,
    paddingBottom: 190,
    paddingHorizontal: 14,
    backgroundColor: '#9ED0EE',
  },
});
