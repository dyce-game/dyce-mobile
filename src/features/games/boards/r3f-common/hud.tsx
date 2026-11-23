import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@dyce/ui';
import type { MatchPlayer } from '@dyce/shared';
import { UserAvatar } from '@/features/avatar/UserAvatar';

/**
 * The glass pieces on top of a 3D table: the same in every sports board (the room is a fixed dark scene in
 * both themes, as in the design; see ADR-020), so white ink on dark glass. Contrast of the ink on the glass is
 * above 7:1 against the darkest and lightest room colours in use.
 */
export const INK = '#FFFFFF';
export const SOFT = 'rgba(255,255,255,0.8)';
export const GLASS = 'rgba(0,0,0,0.42)';
export const GLASS_EDGE = 'rgba(255,255,255,0.16)';
export const BRASS = '#E3A93B';

export type Tone = 'hit' | 'rim' | 'miss' | 'foul';
export const TONE_FILL: Record<Tone, string> = {
  hit: '#17834F',
  rim: '#A86F12',
  miss: '#44364B',
  foul: '#B3361A',
};
export type BannerState = { text: string; tone: Tone; id: number };

/** The opponent (or a player) as a glass pill: avatar, name, one line under it. */
export function PlayerChip({
  player,
  name,
  line,
  label,
  highlight,
  style,
}: {
  player: MatchPlayer | null;
  name: string;
  line: string;
  label: string;
  highlight?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[
        styles.chip,
        { backgroundColor: GLASS, borderColor: highlight ? BRASS : GLASS_EDGE },
        style,
      ]}
    >
      {player ? <UserAvatar avatar={player.avatar} name={name} size={36} /> : null}
      <View style={styles.chipText}>
        <Text variant="callout" color={INK} numberOfLines={1}>
          {name}
        </Text>
        <Text variant="footnote" color={SOFT} numberOfLines={1}>
          {line}
        </Text>
      </View>
    </View>
  );
}

/** The round "Sliders / Flick" switch in the corner: the non-gesture way to play is always one tap away. */
export function ModeToggle({
  sliders,
  onToggle,
  gestureWord,
  disabled,
}: {
  sliders: boolean;
  onToggle: () => void;
  gestureWord: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        sliders
          ? `Use the ${gestureWord.toLowerCase()} gesture to play`
          : 'Use sliders and a button to play'
      }
      accessibilityState={{ selected: sliders, disabled: !!disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={[
        styles.toggle,
        { backgroundColor: GLASS, borderColor: GLASS_EDGE },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text variant="footnote" color={INK}>
        {sliders ? gestureWord : 'Sliders'}
      </Text>
    </Pressable>
  );
}

/** A short message that fades: what just happened (a made basket, a foul), read out politely. */
export function Banner({ banner, top = 74 }: { banner: BannerState | null; top?: number }) {
  if (!banner) return null;
  return (
    <View style={[styles.bannerWrap, { top }]} pointerEvents="none">
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={banner.text}
        style={[styles.banner, { backgroundColor: TONE_FILL[banner.tone] }]}
      >
        <Text variant="callout" color={INK} style={styles.center}>
          {banner.text}
        </Text>
      </View>
    </View>
  );
}

/** A row of dots (balls left, darts left, arrows left): filled = left. */
export function Pips({ total, left, noun }: { total: number; left: number; noun: string }) {
  return (
    <View
      style={styles.pips}
      accessible
      accessibilityLabel={`${left} of ${total} ${noun} left this turn`}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.pip, { backgroundColor: i < left ? '#FFFFFF' : 'rgba(255,255,255,0.3)' }]}
        />
      ))}
    </View>
  );
}

/** A small stat on glass: a caption over a big value. */
export function StatPanel({
  caption,
  value,
  label,
  accent,
}: {
  caption: string;
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.panel, { backgroundColor: GLASS, borderColor: accent ? BRASS : GLASS_EDGE }]}
    >
      <Text variant="caption" color={SOFT} numberOfLines={1}>
        {caption}
      </Text>
      <Text variant="title" color={INK} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export const hudStyles = StyleSheet.create({
  top: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 14, gap: 10 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  glassPanel: {
    gap: 6,
    padding: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  hint: { flex: 1, alignItems: 'center', gap: 6, paddingBottom: 6 },
  center: { textAlign: 'center' },
});

const styles = StyleSheet.create({
  chip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 16,
    borderRadius: 26,
    borderWidth: 1,
  },
  chipText: { flexShrink: 1 },
  toggle: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerWrap: { position: 'absolute', left: 12, right: 12, top: 74, alignItems: 'center' },
  banner: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, maxWidth: '100%' },
  center: { textAlign: 'center' },
  pips: { flexDirection: 'row', gap: 6 },
  pip: { width: 12, height: 12, borderRadius: 6 },
  panel: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
});
