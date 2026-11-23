import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@dyce/ui';
import { SliderRow } from './r3f-common/SliderRow';
import { BRASS, INK, SOFT, hudStyles } from './r3f-common/hud';
import {
  AIM_MAX,
  AIM_STEP,
  DRAW_MAX,
  DRAW_STEP,
  aimXLabel,
  aimYLabel,
  drawLabel,
  pushLine,
  stepAim,
  stepDraw,
  windWords,
} from './archery-logic';

/**
 * The sight controls. The Draw slider and the wind row are always there (a short draw drops low; the wind
 * pushes the arrow); in the sliders mode the Across and Up sliders for the sight join them. Across is also
 * the wind compensation: "Allow for wind" sets it to cancel the push at the current draw.
 */
export function ArcheryControls({
  aimX,
  aimY,
  draw,
  windDms,
  showAim,
  onAimX,
  onAimY,
  onDraw,
  onAllowForWind,
}: {
  aimX: number;
  aimY: number;
  draw: number;
  windDms: number;
  showAim: boolean;
  onAimX: (v: number) => void;
  onAimY: (v: number) => void;
  onDraw: (v: number) => void;
  onAllowForWind: () => void;
}) {
  return (
    <View style={hudStyles.glassPanel}>
      <View style={styles.windRow}>
        <View
          style={styles.windText}
          accessible
          accessibilityLabel={`Wind: ${windWords(windDms)}. ${pushLine(windDms, draw)}`}
        >
          <Text variant="footnote" color={INK}>
            Wind: {windWords(windDms)}
          </Text>
          <Text variant="footnote" color={SOFT}>
            {pushLine(windDms, draw)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Allow for the wind: move the sight to cancel its push"
          onPress={onAllowForWind}
          style={styles.allow}
        >
          <Text variant="footnote" color="#1A1206">
            Allow for wind
          </Text>
        </Pressable>
      </View>
      {showAim ? (
        <>
          <SliderRow
            label="Across"
            value={aimX}
            min={-AIM_MAX}
            max={AIM_MAX}
            step={10}
            valueText={aimXLabel(aimX)}
            valueWidth={84}
            onChange={onAimX}
            onStep={(d) => onAimX(stepAim(aimX, d, AIM_STEP))}
          />
          <SliderRow
            label="Up"
            value={aimY}
            min={-AIM_MAX}
            max={AIM_MAX}
            step={10}
            valueText={aimYLabel(aimY)}
            valueWidth={84}
            onChange={onAimY}
            onStep={(d) => onAimY(stepAim(aimY, d, AIM_STEP))}
          />
        </>
      ) : null}
      <SliderRow
        label="Draw"
        value={draw}
        min={0}
        max={DRAW_MAX}
        step={50}
        valueText={drawLabel(draw)}
        valueWidth={84}
        onChange={onDraw}
        onStep={(d) => onDraw(stepDraw(draw, d, DRAW_STEP))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  windRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  windText: { flex: 1 },
  allow: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    justifyContent: 'center',
    backgroundColor: BRASS,
  },
});
