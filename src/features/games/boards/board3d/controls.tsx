import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@dyce/ui';
import { BRASS, GLASS, GLASS_EDGE, INK } from '../r3f-common/hud';

/**
 * Small glass controls the 3D board games share: a 44pt round-cornered button with a label or a glyph, an arrow
 * pad, and a two-way switch. White ink on dark glass in both themes (the room is a fixed dark scene), with the
 * state in the glass edge and the accessibility state as well, so colour is never the only signal.
 */

export const TOUCH = 44;

export function GlassButton({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  selected,
  children,
  style,
  tone = 'glass',
}: {
  label?: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'glass' | 'brass' | 'ember' | 'felt';
}) {
  const fill =
    tone === 'brass'
      ? '#E3A93B'
      : tone === 'ember'
        ? '#C93E1C'
        : tone === 'felt'
          ? '#17834F'
          : GLASS;
  const ink = tone === 'brass' ? '#3A2400' : INK;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.btn,
        { backgroundColor: fill, borderColor: selected ? BRASS : GLASS_EDGE },
        selected && styles.selected,
        disabled && styles.disabled,
        style,
      ]}
    >
      {children}
      {label ? (
        <Text variant="callout" color={ink} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

export type Arrow = 'left' | 'right' | 'up' | 'down';
const ARROW_PATH: Record<Arrow, string> = {
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
};

export function ArrowGlyph({
  dir,
  color = INK,
  size = 22,
}: {
  dir: Arrow;
  color?: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <Path
        d={ARROW_PATH[dir]}
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Four arrow buttons in a row: the way to move a cursor without touching the 3D scene. */
export function ArrowRow({
  onMove,
  disabled,
  noun,
}: {
  onMove: (dr: number, dc: number) => void;
  disabled?: boolean;
  /** What is being moved, for the labels: "target", "ship". */
  noun: string;
}) {
  const items: { dir: Arrow; dr: number; dc: number; word: string }[] = [
    { dir: 'left', dr: 0, dc: -1, word: 'left' },
    { dir: 'up', dr: -1, dc: 0, word: 'up' },
    { dir: 'down', dr: 1, dc: 0, word: 'down' },
    { dir: 'right', dr: 0, dc: 1, word: 'right' },
  ];
  return (
    <View style={styles.arrows}>
      {items.map((a) => (
        <GlassButton
          key={a.dir}
          accessibilityLabel={`Move ${noun} ${a.word}`}
          disabled={disabled}
          onPress={() => onMove(a.dr, a.dc)}
          style={styles.arrow}
        >
          <ArrowGlyph dir={a.dir} />
        </GlassButton>
      ))}
    </View>
  );
}

/** A two-way switch on glass ("Their waters" / "Your fleet", "Ayo" / "Mancala"). */
export function TwoWay<T extends string>({
  value,
  options,
  onChange,
  label,
  readOnly,
}: {
  value: T;
  options: { value: T; label: string; accessibilityLabel: string }[];
  onChange?: (v: T) => void;
  label: string;
  /** Shows which rules or side is on without being a control. */
  readOnly?: boolean;
}) {
  return (
    <View
      accessibilityRole={readOnly ? undefined : 'tablist'}
      accessibilityLabel={label}
      style={[styles.two, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}
    >
      {options.map((o) => {
        const on = o.value === value;
        const body = (
          <Text variant="footnote" color={on ? '#3A2400' : INK} numberOfLines={1}>
            {o.label}
          </Text>
        );
        return readOnly ? (
          <View
            key={o.value}
            accessible
            accessibilityLabel={`${o.accessibilityLabel}${on ? ', in play' : ''}`}
            style={[styles.twoItem, on && styles.twoOn]}
          >
            {body}
          </View>
        ) : (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.accessibilityLabel}
            accessibilityState={{ selected: on }}
            onPress={() => onChange?.(o.value)}
            style={[styles.twoItem, on && styles.twoOn]}
          >
            {body}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: TOUCH,
    minWidth: TOUCH,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { borderWidth: 2 },
  disabled: { opacity: 0.45 },
  arrows: { flexDirection: 'row', gap: 6 },
  arrow: { paddingHorizontal: 0, width: TOUCH },
  two: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 24,
    borderWidth: 1,
    gap: 3,
  },
  twoItem: {
    minHeight: TOUCH,
    minWidth: TOUCH,
    paddingHorizontal: 14,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoOn: { backgroundColor: '#E3A93B' },
});
