import { useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@dyce/ui';
import { BRASS, INK, SOFT } from './hud';

/**
 * One labelled slider for a board's non-gesture controls: − and + buttons (44pt), a draggable track, and the
 * screen reader's "adjustable" increment / decrement actions, so nothing needs a swipe. The value it holds is
 * the same integer the gesture would have produced (the caller quantises).
 */
export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  valueText,
  onChange,
  onStep,
  labelWidth = 52,
  valueWidth = 78,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueText: string;
  onChange: (v: number) => void;
  onStep: (dir: 1 | -1) => void;
  labelWidth?: number;
  valueWidth?: number;
  disabled?: boolean;
}) {
  const [width, setWidth] = useState(1);
  const widthRef = useRef(1);
  const startValue = useRef(value);
  const latest = useRef({ value, min, max, onChange, step, disabled });
  latest.current = { value, min, max, onChange, step, disabled };

  const snap = (raw: number) => {
    const { min: lo, max: hi, step: st } = latest.current;
    return Math.min(hi, Math.max(lo, lo + Math.round((raw - lo) / st) * st));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { min: lo, max: hi } = latest.current;
        const x = Math.min(Math.max(e.nativeEvent.locationX, 0), widthRef.current);
        const v = snap(lo + (x / widthRef.current) * (hi - lo));
        startValue.current = v;
        latest.current.onChange(v);
      },
      onPanResponderMove: (_, g) => {
        const { min: lo, max: hi } = latest.current;
        latest.current.onChange(snap(startValue.current + (g.dx / widthRef.current) * (hi - lo)));
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = Math.max(1, e.nativeEvent.layout.width);
    setWidth(widthRef.current);
  };
  const frac = max === min ? 0 : (value - min) / (max - min);
  const onAction = (e: AccessibilityActionEvent) => {
    if (disabled) return;
    if (e.nativeEvent.actionName === 'increment') onStep(1);
    if (e.nativeEvent.actionName === 'decrement') onStep(-1);
  };

  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <Text variant="footnote" color={INK} style={{ width: labelWidth }} numberOfLines={1}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} lower`}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
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
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={() => onStep(1)}
        style={styles.step}
      >
        <Text variant="headline" color={INK}>
          +
        </Text>
      </Pressable>
      <Text
        variant="footnote"
        color={SOFT}
        style={[styles.value, { width: valueWidth }]}
        numberOfLines={1}
      >
        {valueText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  disabled: { opacity: 0.5 },
  step: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  trackHit: { flex: 1, height: 44, justifyContent: 'center', minWidth: 60 },
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
  value: { textAlign: 'right' },
});
