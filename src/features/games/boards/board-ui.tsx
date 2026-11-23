import { useCallback, useState, type ReactNode } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { MatchPlayer } from '@dyce/shared';
import { Text, TokenButton } from '@dyce/ui';
import { Gradient } from '@/components/Gradient';
import { UserAvatar } from '@/features/avatar/UserAvatar';

/**
 * The pieces the classic board games share: the dark table, the opponent chip, the bar at the bottom with the
 * confirm button, the resign control and the "list the moves" alternative to tapping the board. The designs
 * draw these tables on a fixed dark panel in both themes (PlayChess and PlayChessDark are the same picture),
 * so the colours here are fixed too.
 */

export const INK = '#FFFFFF';
export const SOFT = 'rgba(255,255,255,0.82)';
export const GLASS = 'rgba(0,0,0,0.38)';
export const GLASS_EDGE = 'rgba(255,255,255,0.14)';
export const GOLD = '#E3A93B';
export const EMBER = '#C93E1C';
/** Your colour and theirs on the boards that need two (Dots & Boxes, Filler); the designs' red and blue. */
export const ME_COLOUR = '#C93E1C';
export const THEM_COLOUR = '#2457D6';

/** The dark table. `warm` is the chess/checkers amber, the default the neutral charcoal of the other two. */
export function TableStage({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'warm' | 'neutral';
}) {
  return (
    <Gradient
      radius={28}
      radial={{ cx: 0.5, cy: 0.3 }}
      stops={
        tone === 'warm'
          ? [
              [0, '#2E2016'],
              [0.75, '#0E0905'],
            ]
          : [
              [0, '#2A2420'],
              [0.75, '#0F0D0B'],
            ]
      }
      style={styles.stage}
    >
      {children}
    </Gradient>
  );
}

/** Measures the space a board may use, so the board can fill it. */
export function useArea() {
  const [area, setArea] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea((a) => (a.w === width && a.h === height ? a : { w: width, h: height }));
  }, []);
  return { area, onLayout };
}

/** "Tunde · black · thinking…", the glass chip under the header. */
export function OpponentChip({
  player,
  name,
  text,
}: {
  player: MatchPlayer | null;
  name: string;
  text: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={text}
      style={[styles.chip, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}
    >
      {player ? <UserAvatar avatar={player.avatar} name={name} size={34} /> : null}
      <Text variant="footnote" color={INK} style={styles.chipText} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

/**
 * The bar at the bottom: your avatar (ringed in amber on your turn), what is happening, and the one button
 * that confirms the move. `live` makes the lines a polite live region so a screen reader hears turn changes.
 */
export function ActionBar({
  me,
  myName,
  title,
  subtitle,
  yourTurn,
  actionLabel,
  onAction,
  actionDisabled,
  actionTone = 'ember',
  accessibilityLabel,
}: {
  me: MatchPlayer | null;
  myName: string;
  title: string;
  subtitle?: string | null;
  yourTurn: boolean;
  actionLabel?: string | null;
  onAction?: () => void;
  actionDisabled?: boolean;
  actionTone?: 'ember' | 'felt';
  accessibilityLabel?: string;
}) {
  return (
    <View style={[styles.bar, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}>
      <View style={styles.barAvatar}>
        {me ? <UserAvatar avatar={me.avatar} name={myName} size={42} /> : null}
        {yourTurn ? <View pointerEvents="none" style={styles.turnRing} /> : null}
      </View>
      <View
        accessible
        accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join('. ')}
        accessibilityLiveRegion="polite"
        style={styles.barText}
      >
        <Text variant="callout" color={INK} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color={SOFT} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel ? (
        <TokenButton
          label={actionLabel}
          tone={actionTone}
          onPress={onAction}
          disabled={actionDisabled}
          style={styles.barButton}
        />
      ) : null}
    </View>
  );
}

/** A small glass button: "Clear", "Resign", "Move list". 44pt high, labelled. */
export function GlassButton({
  label,
  onPress,
  disabled,
  selected,
  accessibilityLabel,
  hint,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  accessibilityLabel?: string;
  hint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.glassButton,
        {
          backgroundColor: selected ? 'rgba(227,169,59,0.28)' : 'rgba(255,255,255,0.12)',
          borderColor: selected ? GOLD : 'rgba(255,255,255,0.16)',
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Text variant="footnote" color={INK} style={styles.glassButtonText}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Resign, with a second tap to confirm. The server only accepts a move (and so a resignation) from the player
 * whose turn it is, so the control is shown on your turn.
 */
export function ResignControl({
  available,
  busy,
  onResign,
}: {
  available: boolean;
  busy: boolean;
  onResign: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!available) return null;
  if (!asking) {
    return (
      <GlassButton
        label="Resign"
        accessibilityLabel="Resign the game"
        hint="Asks you to confirm"
        onPress={() => setAsking(true)}
      />
    );
  }
  return (
    <View style={styles.askRow} accessibilityRole="alert">
      <Text variant="footnote" color={INK} style={styles.askText}>
        Resign and give them the win?
      </Text>
      <GlassButton label="Keep playing" onPress={() => setAsking(false)} />
      <GlassButton
        label="Yes, resign"
        disabled={busy}
        onPress={() => {
          setAsking(false);
          onResign();
        }}
      />
    </View>
  );
}

export type ListedMove = { key: string; label: string; onPress: () => void; selected?: boolean };

/**
 * Every legal move as a list of buttons: the way to play without touching the board (screen readers, switch
 * access, a board too small to tap accurately). It is the same set of moves the board offers.
 */
export function MoveList({
  title,
  moves,
  empty,
}: {
  title: string;
  moves: ListedMove[];
  empty: string;
}) {
  return (
    <View
      style={[styles.list, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}
      accessibilityLabel={title}
    >
      <Text variant="footnote" color={INK} accessibilityRole="header">
        {title}
      </Text>
      {moves.length === 0 ? (
        <Text variant="footnote" color={SOFT}>
          {empty}
        </Text>
      ) : (
        <ScrollView style={styles.listScroll} nestedScrollEnabled>
          {moves.map((m) => (
            <Pressable
              key={m.key}
              accessibilityRole="button"
              accessibilityLabel={m.label}
              accessibilityState={{ selected: !!m.selected }}
              onPress={m.onPress}
              style={[styles.listRow, m.selected ? styles.listRowOn : null]}
            >
              <Text variant="footnote" color={INK}>
                {m.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  chip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
    maxWidth: '100%',
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 23,
    borderWidth: 1,
  },
  chipText: { flexShrink: 1, fontFamily: 'Figtree_800ExtraBold' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 30,
    borderWidth: 1,
  },
  barAvatar: { width: 42, height: 42 },
  turnRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: GOLD,
    borderRightColor: 'transparent',
  },
  barText: { flex: 1, minWidth: 0 },
  barButton: { flexShrink: 0 },
  glassButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassButtonText: { fontFamily: 'Figtree_700Bold' },
  askRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  askText: { flexShrink: 1 },
  list: { borderRadius: 18, borderWidth: 1, padding: 10, gap: 6 },
  listScroll: { maxHeight: 180 },
  listRow: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  listRowOn: { backgroundColor: 'rgba(227,169,59,0.28)' },
});
