import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Text, useTheme } from '@dyce/ui';

export type StateCardTone = 'offline' | 'issue' | 'danger';

const TONE: Record<StateCardTone, { ring: string; button: string }> = {
  offline: { ring: '#0067D6', button: '#0067D6' },
  issue: { ring: '#FF7A1A', button: '#C93E1C' },
  danger: { ring: '#E0453A', button: '#C4314B' },
};

export type StateCardProps = {
  tone: StateCardTone;
  /** Shown in the ring: an avatar (opponent lost connection), or a glyph. */
  center: ReactNode;
  title: string;
  body: string;
  /** The pill about what is at stake ("Ð2,000 pot is safe"). */
  chip?: string | null;
  primary: { label: string; onPress: () => void; busy?: boolean };
  secondary?: { label: string; onPress: () => void } | null;
  /** The error line under the buttons. */
  error?: string | null;
};

/**
 * The centred card over a dimmed game (design: GameIssues / GameOffline / GameForfeit): a ring with the
 * subject in it, a title, the plain-words consequence, what is at stake, and one or two buttons. It covers the
 * game (`absoluteFill` of its parent) and traps focus for screen readers.
 */
export function GameStateCard({
  tone,
  center,
  title,
  body,
  chip,
  primary,
  secondary,
  error,
}: StateCardProps) {
  const { colors } = useTheme();
  const t = TONE[tone];
  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <View style={[styles.card, { backgroundColor: colors.card }]} accessibilityRole="alert">
        <View style={styles.ringBox}>
          <View style={[styles.ring, { borderColor: t.ring }]} />
          <View style={styles.center}>{center}</View>
        </View>
        <Text variant="title" style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text color="sub" style={styles.body}>
          {body}
        </Text>
        {chip ? (
          <View style={styles.chip}>
            <Svg
              width={13}
              height={13}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#B33416"
              strokeWidth={2.8}
              strokeLinecap="round"
            >
              <Rect x={5} y={11} width={14} height={9} rx={2} />
              <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </Svg>
            <Text variant="footnote" color="#B33416">
              {chip}
            </Text>
          </View>
        ) : null}
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primary.label}
            accessibilityState={{ disabled: !!primary.busy, busy: !!primary.busy }}
            disabled={primary.busy}
            onPress={primary.onPress}
            style={[styles.primary, { backgroundColor: t.button, opacity: primary.busy ? 0.6 : 1 }]}
          >
            <Text variant="callout" color="#FFFFFF" style={styles.primaryText}>
              {primary.label}
            </Text>
          </Pressable>
          {secondary ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={secondary.label}
              onPress={secondary.onPress}
              style={[styles.secondary, { backgroundColor: colors.chip }]}
            >
              <Text variant="callout">{secondary.label}</Text>
            </Pressable>
          ) : null}
        </View>
        {error ? (
          <Text
            variant="footnote"
            color="accent"
            style={styles.error}
            accessibilityLiveRegion="polite"
          >
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** A signal-lost glyph for the offline card (no emoji as icons). */
export function OfflineGlyph({ color }: { color: string }) {
  return (
    <Svg
      width={40}
      height={40}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M2 8.8a15 15 0 0 1 20 0" />
      <Path d="M5 12.5a10 10 0 0 1 14 0" />
      <Path d="M8.5 16a5 5 0 0 1 7 0" />
      <Circle cx={12} cy={19.5} r={1} fill={color} />
      <Path d="M3 3l18 18" />
    </Svg>
  );
}

/** A flag glyph for the resign confirmation. */
export function FlagGlyph({ color }: { color: string }) {
  return (
    <Svg
      width={40}
      height={40}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M5 21V4" />
      <Path d="M5 4h11l-2 4 2 4H5" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: 'rgba(5,8,7,0.62)',
    justifyContent: 'center',
    padding: 24,
    zIndex: 20,
  },
  card: {
    borderRadius: 28,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  ringBox: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  ring: { ...(StyleSheet.absoluteFill as object), borderRadius: 48, borderWidth: 6 },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { textAlign: 'center', marginTop: 6, fontSize: 24 },
  body: { textAlign: 'center', fontSize: 15, lineHeight: 22 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#FBE7DF',
  },
  buttons: { alignSelf: 'stretch', gap: 8, marginTop: 12 },
  primary: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16 },
  secondary: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  error: { textAlign: 'center', marginTop: 6 },
});
