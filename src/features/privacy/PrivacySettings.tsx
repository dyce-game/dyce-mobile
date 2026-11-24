import { StyleSheet, Switch, View } from 'react-native';
import { Text, brand, useTheme } from '@dyce/ui';
import { setConsent, useDiagnosticsConsent } from '@/lib/privacy-consent';

/**
 * Settings > Privacy: one switch for anonymous usage data and crash reports (Apple 5.1.1(ii): consent, and an easy
 * way to withdraw it). In a store build it starts off; turning it off stops sending at once and drops what is queued.
 * What is collected is listed in the privacy notice (Help and legal).
 */
export function PrivacySettings() {
  const { colors } = useTheme();
  const on = useDiagnosticsConsent();
  return (
    <>
      <Text style={styles.label} color="sub">
        Privacy
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.row}>
          <View style={styles.body}>
            <Text style={styles.title}>Share usage and crash data</Text>
            <Text style={styles.sub} color="sub">
              Helps us fix crashes and improve Dyce. Never your messages, name or number.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Share usage and crash data"
            value={on}
            onValueChange={(v) => void setConsent(v)}
            trackColor={{ true: brand.ember.fill }}
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontFamily: 'Figtree_600SemiBold',
    paddingHorizontal: 4,
    paddingTop: 14,
    paddingBottom: 6,
  },
  card: { borderRadius: 16, overflow: 'hidden' },
  row: {
    minHeight: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  body: { flex: 1, paddingVertical: 8 },
  title: { fontSize: 15, fontFamily: 'Figtree_500Medium' },
  sub: { fontSize: 12, fontFamily: 'Figtree_500Medium' },
});
