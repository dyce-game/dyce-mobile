import { Pressable, StyleSheet, View } from 'react-native';
import { OTP_LENGTH } from '@dyce/shared';
import { OtpInput, Text } from '@dyce/ui';

/**
 * The 6-digit code step, shared by the phone and the email screens (and the "add an email or a phone" screens):
 * the boxes, the error line, the "Code filled in" note after a paste or autofill, and the Change / Resend row.
 * The screen owns the state and the network calls; this only draws and reports.
 */
export function CodeEntry({
  code,
  onCodeChange,
  busy,
  error,
  errorSignal,
  pasted,
  secondsLeft,
  onResend,
  onChange,
  changeLabel,
}: {
  code: string;
  onCodeChange: (next: string) => void;
  busy: boolean;
  error?: string;
  errorSignal: number;
  pasted: boolean;
  secondsLeft: number;
  onResend: () => void;
  /** Go back to typing the number or address. */
  onChange: () => void;
  /** "Change number" or "Change email". */
  changeLabel: string;
}) {
  return (
    <View style={styles.form}>
      <OtpInput
        value={code}
        onChange={onCodeChange}
        errorSignal={errorSignal}
        disabled={busy}
        autoFocus
      />
      {error ? (
        <Text color="accent" variant="footnote" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : pasted && code.length === OTP_LENGTH ? (
        <Text color="money" variant="footnote">
          Code filled in
        </Text>
      ) : null}
      <View style={styles.resend}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={changeLabel}
          onPress={onChange}
          style={styles.link}
        >
          <Text color="accent" variant="callout">
            {changeLabel}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            secondsLeft > 0 ? `Resend code in ${secondsLeft} seconds` : 'Resend code'
          }
          accessibilityState={{ disabled: secondsLeft > 0 || busy }}
          disabled={secondsLeft > 0 || busy}
          onPress={onResend}
          style={styles.link}
        >
          <Text color={secondsLeft > 0 ? 'sub' : 'accent'} variant="callout">
            {secondsLeft > 0
              ? `Resend in 0:${String(secondsLeft).padStart(2, '0')}`
              : 'Resend code'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 20, gap: 12 },
  resend: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { minHeight: 44, justifyContent: 'center' },
});
