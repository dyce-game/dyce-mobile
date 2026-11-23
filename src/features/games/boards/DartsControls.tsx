import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@dyce/ui';
import { SliderRow } from './r3f-common/SliderRow';
import { BRASS, INK, SOFT, hudStyles } from './r3f-common/hud';
import {
  AIM_FINE_STEP,
  AIM_MAX,
  AIM_STEP,
  readingLabel,
  stepAim,
  targetLabel,
  targetPoint,
  targetSpoken,
  type Point,
  type Target,
} from './darts-logic';

const BULL: Target = { ring: 'dbull', n: 50 };
const T20: Target = { ring: 'triple', n: 20 };
const T19: Target = { ring: 'triple', n: 19 };

const sameTarget = (a: Target, b: Target) => a.ring === b.ring && a.n === b.n;

/**
 * The accessible way to throw: an Across and an Up slider for the aim point (each with − and + buttons and
 * screen-reader actions), what the board reads there, and chips that aim at a target in one tap (the hint's
 * target first, then the bull and the trebles most players go for).
 */
export function DartsControls({
  aim,
  onAim,
  suggested,
}: {
  aim: Point;
  onAim: (p: Point) => void;
  /** The checkout or clock target for the next dart, if any. */
  suggested: Target | null;
}) {
  const chips: Target[] = [];
  for (const t of [suggested, BULL, T20, T19]) {
    if (t && !chips.some((c) => sameTarget(c, t))) chips.push(t);
  }
  return (
    <View style={hudStyles.glassPanel}>
      <Text variant="footnote" color={SOFT} accessibilityLiveRegion="polite">
        Aiming at: {readingLabel(aim)}
      </Text>
      <SliderRow
        label="Across"
        value={aim.x}
        min={-AIM_MAX}
        max={AIM_MAX}
        step={AIM_FINE_STEP}
        valueText={mm(aim.x, 'left', 'right')}
        valueWidth={84}
        onChange={(v) => onAim({ x: v, y: aim.y })}
        onStep={(d) => onAim({ x: stepAim(aim.x, d, AIM_STEP), y: aim.y })}
      />
      <SliderRow
        label="Up"
        value={aim.y}
        min={-AIM_MAX}
        max={AIM_MAX}
        step={AIM_FINE_STEP}
        valueText={mm(aim.y, 'down', 'up')}
        valueWidth={84}
        onChange={(v) => onAim({ x: aim.x, y: v })}
        onStep={(d) => onAim({ x: aim.x, y: stepAim(aim.y, d, AIM_STEP) })}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {chips.map((t) => (
          <Pressable
            key={`${t.ring}${t.n}`}
            accessibilityRole="button"
            accessibilityLabel={`Aim at ${targetSpoken(t)}`}
            onPress={() => onAim(targetPoint(t))}
            style={[styles.chip, suggested && sameTarget(suggested, t) && styles.chipHint]}
          >
            <Text variant="callout" color={suggested && sameTarget(suggested, t) ? '#1A1206' : INK}>
              {targetLabel(t)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** "12 mm left" for the sliders' spoken value (the aim is in tenths of a millimetre). */
function mm(v: number, neg: string, pos: string): string {
  if (v === 0) return 'Centre';
  return `${(Math.abs(v) / 10).toFixed(0)} mm ${v < 0 ? neg : pos}`;
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingVertical: 2 },
  chip: {
    minHeight: 44,
    minWidth: 52,
    paddingHorizontal: 14,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  chipHint: { backgroundColor: BRASS, borderColor: BRASS },
});
