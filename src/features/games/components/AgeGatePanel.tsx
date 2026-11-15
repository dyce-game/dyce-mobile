import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextField, TokenButton, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { useAgeGate } from '../use-games';

/** A plausible birth year: four digits, not in the future, not before 1900. */
export function parseBirthYear(text: string, thisYear = new Date().getFullYear()): number | null {
  if (!/^\d{4}$/.test(text.trim())) return null;
  const y = Number(text);
  return y >= 1900 && y <= thisYear ? y : null;
}

/**
 * The age gate (design: AgeGate), asked once, the first time someone picks Pool. Free games are open from 13;
 * Pool is 18+. Only the birth year is kept (ADR-007), so that is all this asks for. The answer can't be
 * changed later, and a "no" just means Pool stays hidden.
 */
export function AgeGatePanel({
  onAdult,
  onFree,
}: {
  /** They are 18 or older: carry on to Pool. */
  onAdult: () => void;
  /** They chose to play free instead (or are under 18). */
  onFree: () => void;
}) {
  const { colors } = useTheme();
  const [year, setYear] = useState('');
  const [touched, setTouched] = useState(false);
  const gate = useAgeGate();
  const parsed = parseBirthYear(year);
  const invalid = touched && parsed === null;

  function submit() {
    setTouched(true);
    if (parsed === null) return;
    gate.mutate(parsed, { onSuccess: (r) => (r.isAdult ? onAdult() : undefined) });
  }

  if (gate.data && !gate.data.isAdult) {
    return (
      <View style={styles.root} accessibilityLiveRegion="polite">
        <View style={[styles.badge, { backgroundColor: colors.brandSoft }]}>
          <Text variant="headline" color="accent">
            18+
          </Text>
        </View>
        <Text variant="title" accessibilityRole="header" style={styles.center}>
          Pools aren’t available yet
        </Text>
        <Text color="sub" style={styles.center}>
          Pools are for people who are 18 or older. Free games, spaces, XP and badges are all open
          to you.
        </Text>
        <TokenButton label="Play free" tone="felt" onPress={onFree} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.badge, { backgroundColor: colors.brandSoft }]}>
        <Text variant="headline" color="accent">
          18+
        </Text>
      </View>
      <Text variant="title" accessibilityRole="header" style={styles.center}>
        Pools are for adults
      </Text>
      <Text color="sub" style={styles.center}>
        Free games are open to everyone 13 and up. Staking Dyce Cash in pools is 18+. We ask once.
      </Text>

      <TextField
        label="Year you were born"
        value={year}
        onChangeText={(t) => setYear(t.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        placeholder="1998"
        autoComplete="off"
        returnKeyType="done"
        onSubmitEditing={submit}
        error={
          invalid
            ? 'Enter the four-digit year you were born.'
            : gate.isError
              ? authErrorMessage(gate.error)
              : undefined
        }
      />

      <View style={[styles.note, { backgroundColor: colors.bg2 }]}>
        <Text variant="footnote" color="sub">
          <Text variant="footnote">13–17 </Text>Free games, spaces, XP and badges. Pools hidden.
        </Text>
        <Text variant="footnote" color="sub">
          <Text variant="footnote">18+ </Text>Everything, with a daily pool limit you control.
        </Text>
      </View>

      <TokenButton
        label={gate.isPending ? 'Checking…' : 'Continue'}
        tone="ember"
        disabled={gate.isPending}
        onPress={submit}
      />
      <TokenButton label="Just play free" tone="chip" onPress={onFree} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  note: { borderRadius: 16, padding: 14, gap: 6 },
});
