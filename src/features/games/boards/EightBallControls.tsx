import { useRef, useState } from 'react';
import { type LayoutChangeEvent, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@dyce/ui';
import { SliderRow } from './r3f-common/SliderRow';
import { BRASS, INK, SOFT, hudStyles } from './r3f-common/hud';
import { stepValue } from './r3f-common/shot-flow';
import {
  ANGLE_MAX,
  ANGLE_STEP,
  POWER_MAX,
  POWER_STEP,
  SPIN_MAX,
  SPIN_STEP,
  angleLabel,
  pocketName,
  powerLabel,
  spinLabel,
  toShot,
  wrapAngle,
} from './eight-ball-logic';

/** The accessible way to shoot: Angle, Power and two Spin sliders (and, with ball in hand, where to put the cue ball). */
export function EightBallSliders({
  angle,
  power,
  spinX,
  spinY,
  onAngle,
  onPower,
  onSpin,
  placing,
}: {
  angle: number;
  power: number;
  spinX: number;
  spinY: number;
  onAngle: (v: number) => void;
  onPower: (v: number) => void;
  onSpin: (sx: number, sy: number) => void;
  /** Ball in hand: the cue ball's position sliders (mm) and the button that locks it. */
  placing: {
    x: number;
    y: number;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    ok: boolean;
    onX: (v: number) => void;
    onY: (v: number) => void;
  } | null;
}) {
  return (
    <View style={hudStyles.glassPanel}>
      {placing ? (
        <>
          <SliderRow
            label="Cue along"
            labelWidth={78}
            value={placing.x}
            min={Math.ceil(placing.xMin)}
            max={Math.floor(placing.xMax)}
            step={10}
            valueText={`${Math.round(placing.x / 10)} cm`}
            valueWidth={52}
            onChange={placing.onX}
            onStep={(d) => placing.onX(stepValue(placing.x, d, 20, placing.xMin, placing.xMax))}
          />
          <SliderRow
            label="Cue across"
            labelWidth={78}
            value={placing.y}
            min={Math.ceil(placing.yMin)}
            max={Math.floor(placing.yMax)}
            step={10}
            valueText={`${Math.round(placing.y / 10)} cm`}
            valueWidth={52}
            onChange={placing.onY}
            onStep={(d) => placing.onY(stepValue(placing.y, d, 20, placing.yMin, placing.yMax))}
          />
          {!placing.ok ? (
            <Text variant="footnote" color="#FFB4A2" accessibilityLiveRegion="polite">
              That spot is not allowed: it touches a ball or a pocket.
            </Text>
          ) : null}
        </>
      ) : null}
      <SliderRow
        label="Angle"
        labelWidth={66}
        value={angle}
        min={0}
        max={ANGLE_MAX - 1}
        step={ANGLE_STEP}
        valueText={angleLabel(angle)}
        valueWidth={92}
        onChange={(v) => onAngle(wrapAngle(v))}
        onStep={(d) => onAngle(wrapAngle(angle + d * ANGLE_STEP))}
      />
      <SliderRow
        label="Power"
        labelWidth={66}
        value={power}
        min={0}
        max={POWER_MAX}
        step={POWER_STEP}
        valueText={powerLabel(power)}
        valueWidth={92}
        onChange={onPower}
        onStep={(d) => onPower(stepValue(power, d, POWER_STEP, 0, POWER_MAX))}
      />
      <SliderRow
        label="Spin up"
        labelWidth={66}
        value={spinY}
        min={-SPIN_MAX}
        max={SPIN_MAX}
        step={SPIN_STEP}
        valueText={spinY === 0 ? 'None' : spinY > 0 ? `Follow ${spinY}` : `Draw ${-spinY}`}
        valueWidth={92}
        onChange={(v) => onSpin(spinX, v)}
        onStep={(d) => onSpin(spinX, stepValue(spinY, d, SPIN_STEP, -SPIN_MAX, SPIN_MAX))}
      />
      <SliderRow
        label="Spin side"
        labelWidth={66}
        value={spinX}
        min={-SPIN_MAX}
        max={SPIN_MAX}
        step={SPIN_STEP}
        valueText={spinX === 0 ? 'None' : spinX > 0 ? `Right ${spinX}` : `Left ${-spinX}`}
        valueWidth={92}
        onChange={(v) => onSpin(v, spinY)}
        onStep={(d) => onSpin(stepValue(spinX, d, SPIN_STEP, -SPIN_MAX, SPIN_MAX), spinY)}
      />
    </View>
  );
}

/** A tap pad for where the cue tip strikes the ball, with presets that need no precision. */
export function SpinPad({
  spinX,
  spinY,
  onSpin,
  onClose,
}: {
  spinX: number;
  spinY: number;
  onSpin: (sx: number, sy: number) => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState(96);
  const sizeRef = useRef(96);
  const latest = useRef(onSpin);
  latest.current = onSpin;
  const set = (x: number, y: number) => {
    const r = sizeRef.current / 2;
    const t = toShot(0, 0, ((x - r) / r) * SPIN_MAX, (-(y - r) / r) * SPIN_MAX);
    latest.current(t.spinX, t.spinY);
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => set(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (e) => set(e.nativeEvent.locationX, e.nativeEvent.locationY),
    }),
  ).current;
  const onLayout = (e: LayoutChangeEvent) => {
    sizeRef.current = e.nativeEvent.layout.width;
    setSize(e.nativeEvent.layout.width);
  };
  const r = size / 2;
  const dot = 14;
  const presets: [string, number, number][] = [
    ['Centre', 0, 0],
    ['Follow', 0, 60],
    ['Draw', 0, -60],
    ['Left', -60, 0],
    ['Right', 60, 0],
  ];
  return (
    <View style={[hudStyles.glassPanel, styles.pad]}>
      <View style={styles.padTop}>
        <View
          {...pan.panHandlers}
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Spin on the cue ball"
          accessibilityValue={{ text: spinLabel(spinX, spinY) }}
          style={styles.ball}
        >
          <View pointerEvents="none" style={styles.crossH} />
          <View pointerEvents="none" style={styles.crossV} />
          <View
            pointerEvents="none"
            style={[
              styles.dot,
              {
                left: r + (spinX / SPIN_MAX) * (r - dot / 2) - dot / 2,
                top: r - (spinY / SPIN_MAX) * (r - dot / 2) - dot / 2,
              },
            ]}
          />
        </View>
        <View style={styles.presets}>
          <Text variant="footnote" color={SOFT}>
            Where the cue strikes: {spinLabel(spinX, spinY).toLowerCase()}
          </Text>
          <View style={styles.presetRow}>
            {presets.map(([label, x, y]) => {
              const on = spinX === x && spinY === y;
              return (
                <Pressable
                  key={label}
                  accessibilityRole="button"
                  accessibilityLabel={`Spin: ${label}`}
                  accessibilityState={{ selected: on }}
                  onPress={() => onSpin(x, y)}
                  style={[styles.preset, on && styles.presetOn]}
                >
                  <Text variant="footnote" color={on ? '#1A1206' : INK}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close spin"
        onPress={onClose}
        style={styles.close}
      >
        <Text variant="footnote" color={SOFT}>
          Done
        </Text>
      </Pressable>
    </View>
  );
}

/** When shooting at the 8: which pocket it is called to. */
export function CallPocketRow({
  pocket,
  onChange,
}: {
  pocket: number;
  onChange: (p: number) => void;
}) {
  return (
    <View style={[hudStyles.glassPanel, styles.callRow]}>
      <Text variant="footnote" color={INK} style={styles.callLabel}>
        Call the 8
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Call a different pocket, previous"
        onPress={() => onChange((pocket + 5) % 6)}
        style={styles.step}
      >
        <Text variant="headline" color={INK}>
          ‹
        </Text>
      </Pressable>
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={`8 ball called to the ${pocketName(pocket)} pocket`}
        style={styles.callValue}
      >
        <Text variant="callout" color={BRASS} style={styles.center}>
          {pocketName(pocket)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Call a different pocket, next"
        onPress={() => onChange((pocket + 1) % 6)}
        style={styles.step}
      >
        <Text variant="headline" color={INK}>
          ›
        </Text>
      </Pressable>
    </View>
  );
}

/** A thin bar showing the power that will be used. */
export function PowerBar({ power }: { power: number }) {
  return (
    <View accessible accessibilityLabel={`Power ${powerLabel(power)}`} style={styles.powerTrack}>
      <View
        style={[
          styles.powerFill,
          {
            width: `${Math.round((power / POWER_MAX) * 100)}%`,
            backgroundColor: power > 800 ? '#C93E1C' : power > 500 ? BRASS : '#2BB673',
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: 8 },
  padTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  ball: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F2EEE6',
    overflow: 'hidden',
  },
  crossH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 47,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  crossV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 47,
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  dot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#C93E1C' },
  presets: { flex: 1, gap: 6 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  preset: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  presetOn: { backgroundColor: BRASS },
  close: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: 8 },
  callRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  callLabel: { width: 74 },
  callValue: { flex: 1 },
  center: { textAlign: 'center' },
  step: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  powerTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  powerFill: { height: '100%', borderRadius: 5 },
});
