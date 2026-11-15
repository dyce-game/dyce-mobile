import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira, type MoneyParty } from '@dyce/shared';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { authErrorMessage } from '@/features/auth/messages';
import { clockTime, dayLabel } from '@/features/chat/chat-logic';
import { useReceiptQuery } from '../use-wallet';

const KIND: Record<string, string> = {
  transfer: 'Send',
  request_payment: 'Request payment',
  grant: 'Welcome gift',
  topup: 'Daily top-up',
  stake: 'Pool stake',
  payout: 'Pool winnings',
  refund: 'Pool refund',
  reversal: 'Reversal',
  adjust: 'Adjustment',
};

const person = (p: MoneyParty | null) =>
  p ? `${p.displayName || p.username} (@${p.username})` : null;

/** A receipt (design: receipt). Only someone whose wallet the transaction touched can open it. */
export function ReceiptScreen({ txnId }: { txnId: string }) {
  const { colors } = useTheme();
  const q = useReceiptQuery(txnId);
  const r = q.data;

  const rows: [string, string][] = r
    ? (
        [
          ['Type', KIND[r.kind] ?? r.kind],
          ['From', r.systemLabel && r.direction === 'in' ? r.systemLabel : (person(r.from) ?? '')],
          ['To', r.systemLabel && r.direction === 'out' ? r.systemLabel : (person(r.to) ?? '')],
          ['Note', r.note],
          ['When', `${dayLabel(r.createdAt)} ${clockTime(r.createdAt)}`],
          ['Receipt', r.id],
        ] as [string, string][]
      ).filter(([, v]) => v)
    : [];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Receipt" fallback="/wallet" />
        {q.isLoading ? <Text color="sub">Loading…</Text> : null}
        {q.isError ? (
          <View style={styles.block}>
            <Text color="accent">{authErrorMessage(q.error)}</Text>
            <TokenButton label="Try again" tone="chip" onPress={() => void q.refetch()} />
          </View>
        ) : null}
        {r ? (
          <>
            <View style={styles.center}>
              <Text variant="caption" color="sub">
                {r.direction === 'out' ? 'You paid' : 'You received'}
              </Text>
              <Text variant="display" color={r.direction === 'in' ? 'money' : 'text'}>
                {formatNaira(r.amountKobo)}
              </Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
              {rows.map(([label, value]) => (
                <View key={label} style={styles.line}>
                  <Text variant="footnote" color="sub" style={styles.label}>
                    {label}
                  </Text>
                  <Text variant="footnote" selectable style={styles.value}>
                    {value}
                  </Text>
                </View>
              ))}
            </View>
            <Text variant="footnote" color="sub" style={styles.center}>
              Virtual cash. It can&apos;t be bought or withdrawn.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 14 },
  block: { gap: 10 },
  center: { alignItems: 'center', gap: 4, textAlign: 'center' },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  line: { flexDirection: 'row', gap: 12 },
  label: { width: 70 },
  value: { flex: 1 },
});
