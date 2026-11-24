import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira, type LiveState, type SpaceView } from '@dyce/shared';
import { Icon, MAX_FONT_SCALE, Text, TokenButton, brand } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import type { LiveStatus } from '../../live-connection';
import { clockLabel, formatClock, ringFraction } from '../common-logic';

/** The scenes are dark panels in both themes, as in the designs (PlayImposterDark imports PlayImposter). */
export const ON = '#FFFFFF';
export const ON_DIM = 'rgba(255,255,255,0.78)';
export const GLASS = 'rgba(0,0,0,0.38)';
export const GLASS_EDGE = 'rgba(255,255,255,0.14)';
export const GLASS_BTN = 'rgba(255,255,255,0.12)';

export type SceneColors = { top: string; bottom: string; glow: string };

/** A full-screen dark scene: a radial gradient and a soft glow, behind everything. */
export function Scene({ colors, children }: { colors: SceneColors; children: ReactNode }) {
  return (
    <View style={[styles.scene, { backgroundColor: colors.bottom }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none" aria-hidden>
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="bg" cx="50%" cy="30%" rx="80%" ry="70%">
              <Stop offset="0" stopColor={colors.top} />
              <Stop offset="1" stopColor={colors.bottom} />
            </RadialGradient>
            <RadialGradient id="glow" cx="50%" cy="40%" rx="60%" ry="35%">
              <Stop offset="0" stopColor={colors.glow} />
              <Stop offset="1" stopColor={colors.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#bg)" />
          <Rect x="0" y="0" width="100" height="100" fill="url(#glow)" />
        </Svg>
      </View>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {children}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ---- header -----------------------------------------------------------------------------------------

/** "SPACE POOL · ₦1,800 POT" or "FREE SPACE · XP", as the designs label the mode. */
export function modeLabel(space: Pick<SpaceView, 'mode' | 'potKobo'>): string {
  return space.mode === 'pool'
    ? `SPACE POOL · ${formatNaira(space.potKobo)} POT`
    : 'FREE SPACE · XP';
}

export function PartyHeader({
  space,
  onBack,
  onMenu,
  dark = true,
  textColor = ON,
}: {
  space: Pick<SpaceView, 'mode' | 'potKobo'>;
  onBack: () => void;
  onMenu: () => void;
  dark?: boolean;
  textColor?: string;
}) {
  const btn = dark ? GLASS_BTN : 'rgba(0,0,0,0.06)';
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to the space"
        onPress={onBack}
        style={[styles.round, { backgroundColor: btn }]}
      >
        <Icon name="back" size={20} color={textColor} />
      </Pressable>
      <View
        accessible
        accessibilityLabel={modeLabel(space)}
        style={[
          styles.modePill,
          { backgroundColor: space.mode === 'pool' ? brand.ember.fill : brand.felt.fill },
        ]}
      >
        <Text variant="caption" style={{ color: ON }}>
          {modeLabel(space)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Game menu"
        onPress={onMenu}
        style={[styles.round, { backgroundColor: btn }]}
      >
        <Icon name="menu" size={20} color={textColor} />
      </Pressable>
    </View>
  );
}

/** A small pill under the header (avatars and "6 players · 1 imposter"). */
export function InfoPill({ children }: { children: ReactNode }) {
  return <View style={styles.infoPill}>{children}</View>;
}

// ---- clock ------------------------------------------------------------------------------------------

/** The countdown: a ring of the phase's time and the seconds inside. Counts from the server's clock. */
export function CountdownRing({
  seconds,
  totalMs,
  size = 48,
  color = brand.brass.fill,
  track = 'rgba(255,255,255,0.25)',
  textColor = ON,
}: {
  seconds: number | null;
  totalMs: number;
  size?: number;
  color?: string;
  track?: string;
  textColor?: string;
}) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = ringFraction(seconds, totalMs);
  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={clockLabel(seconds)}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={StyleSheet.absoluteFill} aria-hidden>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={track}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c * frac} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
      </View>
      <Text variant="footnote" style={{ color: textColor }} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {seconds === null ? '–' : seconds}
      </Text>
    </View>
  );
}

/** "NIGHT 2 · 0:20" style label for the phase and its clock. */
export function PhaseTag({ label, seconds }: { label: string; seconds: number | null }) {
  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`${label}, ${clockLabel(seconds)}`}
      style={styles.phaseTag}
    >
      <Text variant="caption" style={{ color: ON }}>
        {label} · {formatClock(seconds)}
      </Text>
    </View>
  );
}

// ---- banners ----------------------------------------------------------------------------------------

/** Reconnecting, replaced, waiting for everyone: said in words, not just a colour. */
export function PartyBanner({
  status,
  live,
}: {
  status: LiveStatus;
  live: Pick<LiveState, 'waiting' | 'status'>;
}) {
  let text: string | null = null;
  let tone: 'warn' | 'bad' | 'info' = 'info';
  if (status === 'replaced') {
    text = 'This table is open on another device.';
    tone = 'bad';
  } else if (status === 'ended') {
    text = 'This table has closed.';
    tone = 'bad';
  } else if (status === 'reconnecting' || status === 'connecting') {
    text = 'Reconnecting… your seat is kept for a minute.';
    tone = 'warn';
  } else if (live.waiting && live.status === 'live') {
    text = 'Waiting for everyone to join. The clock starts when they do.';
  }
  if (!text) return null;
  const bg = tone === 'bad' ? '#8A2410' : tone === 'warn' ? '#A86F12' : 'rgba(40,30,24,0.85)';
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: bg }]}
    >
      <Text variant="footnote" style={{ color: ON }}>
        {text}
      </Text>
    </View>
  );
}

/** A refusal or a hint under the table ("The canvas is full."). */
export function Notice({ text, onLight }: { text: string | null; onLight?: boolean }) {
  if (!text) return null;
  return (
    <Text
      variant="footnote"
      accessibilityRole="alert"
      style={[styles.notice, onLight ? { color: '#B3261E' } : null]}
    >
      {text}
    </Text>
  );
}

// ---- bottom dock ------------------------------------------------------------------------------------

/**
 * The bottom bar of the designs: your avatar, the headline and the line under it, and the one action.
 * The headline is a live region, so a phase change is announced.
 */
export function Dock({
  avatar,
  name,
  headline,
  sub,
  children,
  tone = 'brass',
}: {
  avatar?: SpaceView['members'][number]['avatar'];
  name: string;
  headline: string;
  sub?: string;
  children?: ReactNode;
  tone?: 'brass' | 'ember' | 'none';
}) {
  return (
    <View style={styles.dock}>
      <View
        style={[
          styles.dockAvatar,
          {
            borderColor:
              tone === 'none'
                ? 'transparent'
                : tone === 'ember'
                  ? brand.ember.fill
                  : brand.brass.fill,
          },
        ]}
      >
        <UserAvatar avatar={avatar} name={name} size={40} />
      </View>
      <View style={styles.flex} accessibilityLiveRegion="polite">
        <Text variant="callout" style={{ color: ON }} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {headline}
        </Text>
        {sub ? (
          <Text variant="footnote" style={{ color: ON_DIM }} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {sub}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** A one-line text box with a send button, for clues, guesses and table talk. */
export function SendRow({
  label,
  placeholder,
  button,
  maxLength,
  disabled,
  problem,
  onSend,
  tone = 'ember',
  dark = true,
  autoFocus,
}: {
  label: string;
  placeholder?: string;
  button: string;
  maxLength: number;
  disabled?: boolean;
  /** Why the text cannot be sent yet (shown under the box); null when it can. */
  problem?: (text: string) => string | null;
  onSend: (text: string) => boolean | void;
  tone?: 'ember' | 'felt' | 'brass';
  dark?: boolean;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const issue = problem ? problem(text) : text.trim() ? null : 'Type something first.';
  const can = !disabled && !issue;
  const send = () => {
    if (!can) return;
    if (onSend(text.trim()) !== false) setText('');
  };
  return (
    <View style={styles.sendRow}>
      <TextInput
        value={text}
        onChangeText={setText}
        accessibilityLabel={label}
        accessibilityHint={issue ?? undefined}
        placeholder={placeholder ?? label}
        placeholderTextColor={dark ? 'rgba(255,255,255,0.55)' : '#8A8076'}
        maxLength={maxLength}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="send"
        onSubmitEditing={send}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        editable={!disabled}
        style={[
          styles.input,
          dark
            ? { backgroundColor: 'rgba(255,255,255,0.14)', color: ON, borderColor: GLASS_EDGE }
            : { backgroundColor: 'transparent', color: '#1B140F', borderColor: brand.ember.fill },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        ]}
      />
      <TokenButton label={button} tone={tone} disabled={!can} onPress={send} />
    </View>
  );
}

// ---- leave ------------------------------------------------------------------------------------------

export function LeaveSheet({
  space,
  onLeave,
  onStay,
}: {
  space: Pick<SpaceView, 'mode' | 'seatFeeKobo'>;
  onLeave: () => void;
  onStay: () => void;
}) {
  return (
    <View style={styles.scrim}>
      <View style={styles.sheet} accessibilityViewIsModal accessibilityRole="alert">
        <Text variant="headline" style={{ color: '#1B140F' }}>
          Leave this game?
        </Text>
        <Text style={{ color: '#6F655B' }}>
          {space.mode === 'pool'
            ? `You forfeit your ${formatNaira(space.seatFeeKobo)} seat fee and finish last. The others carry on.`
            : 'You finish last. The others carry on.'}
        </Text>
        <TokenButton label="Leave game" onPress={onLeave} />
        <TokenButton label="Stay and play" tone="chip" onPress={onStay} />
      </View>
    </View>
  );
}

/** Shared state for the leave sheet. */
export function useLeaveSheet(): { open: boolean; show: () => void; hide: () => void } {
  const [open, setOpen] = useState(false);
  return { open, show: () => setOpen(true), hide: () => setOpen(false) };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scene: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    minHeight: 52,
    gap: 8,
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modePill: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  infoPill: {
    alignSelf: 'center',
    maxWidth: '94%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 23,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
    marginTop: 6,
  },
  phaseTag: {
    alignSelf: 'center',
    minHeight: 30,
    paddingHorizontal: 14,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    marginHorizontal: 12,
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  notice: { color: '#FFB4A2', textAlign: 'center', paddingHorizontal: 16, paddingBottom: 4 },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: 30,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  dockAvatar: { borderWidth: 3, borderRadius: 26, padding: 1 },
  sendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontFamily: 'Figtree_600SemiBold',
    fontSize: 16,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FBF8F3',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    gap: 12,
  },
});
