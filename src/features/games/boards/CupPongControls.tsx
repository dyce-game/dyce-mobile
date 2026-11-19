import { useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text, TokenButton } from '@dyce/ui';
import {
  AIM_MAX,
  AIM_STEP,
  POWER_MAX,
  POWER_STEP,
  aimLabel,
  powerLabel,
  stepAim,
  stepPower,
} from './cup-pong-logic';

const INK = '#FFFFFF';
const SOFT = 'rgba(255,255,255,0.78)';
const GLASS = 'rgba(0,0,0,0.5)';
const GLASS_EDGE = 'rgba(255,255,255,0.18)';
const BRASS = '#E3A93B';

/**
 * The accessible way to throw: an Aim slider, a Power slider and a Throw button. Each slider has − and +
 * buttons (44pt) and the screen-reader "adjustable" actions, so nothing needs a swipe gesture. They set
 * the same two integers the flick does.
 */
export function CupPongControls({
  aim,
  power,
  onAim,
  onPower,
  canThrow,
  onThrow,
  onClose,
}: {
  aim: number;
  power: number;
  onAim: (v: number) => void;
  onPower: (v: number) => void;
  canThrow: boolean;
  onThrow: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.panel}>
      <SliderRow
        label="Aim"
        value={aim}
        min={-AIM_MAX}
        max={AIM_MAX}
        step={AIM_STEP}
        valueText={aimLabel(aim)}
        onChange={onAim}
        onStep={(dir) => onAim(stepAim(aim, dir))}
      />
      <SliderRow
        label="Power"
        value={power}
        min={0}
        max={POWER_MAX}
        step={POWER_STEP}
        valueText={powerLabel(power)}
        onChange={onPower}
        onStep={(dir) => onPower(stepPower(power, dir))}
      />
      <View style={styles.buttons}>
        <View style={styles.grow}>
          <TokenButton
            label="Throw"
            tone="brass"
            disabled={!canThrow}
            accessibilityLabel={`Throw the ball: aim ${aimLabel(aim)}, power ${powerLabel(power)}`}
            onPress={onThrow}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back to flicking the ball"
          onPress={onClose}
          style={styles.link}
        >
          <Text variant="footnote" color={SOFT}>
            Flick instead
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  valueText,
  onChange,
  onStep,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueText: string;
  onChange: (v: number) => void;
  onStep: (dir: 1 | -1) => void;
}) {
  const [width, setWidth] = useState(1);
  const widthRef = useRef(1);
  const startValue = useRef(value);
  const latest = useRef({ value, min, max, onChange, step });
  latest.current = { value, min, max, onChange, step };

  const fromX = (x: number) => {
    const { min: lo, max: hi, step: st } = latest.current;
    const raw = lo + (Math.min(Math.max(x, 0), widthRef.current) / widthRef.current) * (hi - lo);
    return Math.min(hi, Math.max(lo, Math.round(raw / st) * st));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const v = fromX(e.nativeEvent.locationX);
        startValue.current = v;
        latest.current.onChange(v);
      },
      onPanResponderMove: (_, g) => {
        const { min: lo, max: hi, step: st } = latest.current;
        const raw = startValue.current + (g.dx / widthRef.current) * (hi - lo);
        latest.current.onChange(Math.min(hi, Math.max(lo, Math.round(raw / st) * st)));
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = Math.max(1, e.nativeEvent.layout.width);
    setWidth(widthRef.current);
  };
  const frac = (value - min) / (max - min);
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') onStep(1);
    if (e.nativeEvent.actionName === 'decrement') onStep(-1);
  };

  return (
    <View style={styles.row}>
      <Text variant="footnote" color={INK} style={styles.label}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} lower`}
        onPress={() => onStep(-1)}
        style={styles.step}
      >
        <Text variant="headline" color={INK}>
          −
        </Text>
      </Pressable>
      <View
        {...pan.panHandlers}
        onLayout={onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value, text: valueText }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
        style={styles.trackHit}
      >
        <View pointerEvents="none" style={styles.track}>
          <View style={[styles.fill, { width: frac * width }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.thumb, { left: Math.min(width - 22, Math.max(0, frac * width - 11)) }]}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} higher`}
        onPress={() => onStep(1)}
        style={styles.step}
      >
        <Text variant="headline" color={INK}>
          +
        </Text>
      </Pressable>
      <Text variant="footnote" color={SOFT} style={styles.value} numberOfLines={1}>
        {valueText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 6,
    padding: 12,
    borderRadius: 20,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { width: 46 },
  step: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  trackHit: { flex: 1, height: 44, justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)' },
  fill: { height: 8, borderRadius: 4, backgroundColor: BRASS },
  thumb: {
    position: 'absolute',
    top: 11,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: BRASS,
  },
  value: { width: 70, textAlign: 'right' },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  grow: { flex: 1 },
  link: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
});
