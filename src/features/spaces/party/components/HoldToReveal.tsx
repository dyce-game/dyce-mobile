import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@dyce/ui';
import type { RoleCard } from '../imposter-logic';

/** A press shorter than this is a tap (the alternative to holding), not the end of a hold. */
const TAP_MS = 300;
/** How long a tap shows the card before hiding it again. */
const TAP_SHOW_MS = 4000;

export type RevealColors = { bg: string; fg: string; sub: string; label: string };

/**
 * The secret card (Imposter, Werewolf). Hidden by default. Hold it to look; let go and it hides. A quick
 * tap shows it for a few seconds instead, for people who cannot hold a finger down, and that is also what
 * a screen reader's double-tap does. It hides again when the app goes to the background or `resetKey`
 * changes (a new phase), so a card never stays face-up on a table.
 */
export function HoldToReveal({
  card,
  resetKey,
  colors,
  hiddenLabel = 'YOUR ROLE',
}: {
  card: Pick<RoleCard, 'title' | 'hint' | 'spoken'>;
  resetKey: string | number;
  colors: RevealColors;
  hiddenLabel?: string;
}) {
  const [shown, setShown] = useState(false);
  const pressedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setShown(false);
  };

  useEffect(() => {
    hide();
  }, [resetKey]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') hide();
    });
    return () => {
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        shown
          ? `Your role card. ${card.spoken}`
          : 'Your role card, hidden. Hold to look, or double tap to show it for a few seconds.'
      }
      accessibilityState={{ expanded: shown }}
      onPressIn={() => {
        pressedAt.current = Date.now();
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        setShown(true);
      }}
      onPressOut={() => {
        if (Date.now() - pressedAt.current >= TAP_MS) hide();
      }}
      onPress={() => {
        // A tap (or a screen reader activation): show for a few seconds, then hide.
        if (Date.now() - pressedAt.current < TAP_MS) {
          if (timer.current) clearTimeout(timer.current);
          setShown(true);
          timer.current = setTimeout(hide, TAP_SHOW_MS);
        }
      }}
      style={[styles.card, { backgroundColor: shown ? colors.bg : '#2A211B' }]}
    >
      <View style={styles.inner}>
        {shown ? (
          <>
            <Text variant="caption" style={{ color: colors.sub }}>
              {colors.label}
            </Text>
            <Text
              variant="title"
              style={{ color: colors.fg, textAlign: 'center' }}
              numberOfLines={2}
            >
              {card.title}
            </Text>
            <Text variant="footnote" style={{ color: colors.sub, textAlign: 'center' }}>
              {card.hint}
            </Text>
          </>
        ) : (
          <>
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {hiddenLabel}
            </Text>
            <Text variant="headline" style={{ color: '#FFFFFF' }}>
              Hold to look
            </Text>
            <Text
              variant="footnote"
              style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}
            >
              Or tap to peek for a few seconds
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 104,
    marginHorizontal: 36,
    borderRadius: 20,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
    boxShadow: '0px 12px 24px rgba(0,0,0,0.5)',
  },
  inner: { alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
});
