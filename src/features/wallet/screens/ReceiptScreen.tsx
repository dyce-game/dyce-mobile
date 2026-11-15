import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { formatNaira, type MoneyParty, type Receipt } from '@dyce/shared';
import { Icon, Text, TokenButton, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { clockTime, dayLabel } from '@/features/chat/chat-logic';
import { useOpenDirect } from '@/features/chat/use-chat';
import { historyTile } from '../wallet-logic';
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

function titleFor(r: Receipt, other: MoneyParty | null): string {
  const who = other ? other.displayName || `@${other.username}` : '';
  if (r.kind === 'transfer')
    return r.direction === 'out' ? `Sent to ${who}` : `Received from ${who}`;
  if (r.kind === 'request_payment')
    return r.direction === 'out' ? `Paid ${who}` : `${who} paid you`;
  return r.systemLabel ?? KIND[r.kind] ?? 'Transaction';
}

/**
 * A receipt (design: Receipt): a card with a coloured tile, what it was, the signed amount, a status pill, a
 * dashed divider and the details; Open chat and Share receipt underneath. Only someone whose wallet the
 * transaction touched can open it.
 */
export function ReceiptScreen({ txnId }: { txnId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const q = useReceiptQuery(txnId);
  const openChat = useOpenDirect();
  const r = q.data;

  const other = r ? (r.direction === 'out' ? r.to : r.from) : null;
  const incoming = r?.direction === 'in';
  const tile = r ? historyTile({ kind: r.kind, counterparty: other }) : null;
  const rows: [string, string][] = r
    ? (
        [
          ['Type', KIND[r.kind] ?? r.kind],
          ['From', r.systemLabel && r.direction === 'in' ? r.systemLabel : (person(r.from) ?? '')],
          ['To', r.systemLabel && r.direction === 'out' ? r.systemLabel : (person(r.to) ?? '')],
          ['Note', r.note],
          ['Date', `${dayLabel(r.createdAt)} ${clockTime(r.createdAt)}`],
          ['Reference', r.id],
        ] as [string, string][]
      ).filter(([, v]) => v)
    : [];
  const back = () =>
    router.canGoBack() ? router.back() : router.replace('/wallet/history' as Href);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg2 }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={back}
          style={styles.back}
        >
          <Icon name="back" color={colors.accent} />
          <Text style={[styles.backText, { color: colors.accent }]}>History</Text>
        </Pressable>

        {q.isLoading ? <Text color="sub">Loading…</Text> : null}
        {q.isError ? (
          <View style={styles.block}>
            <Text color="accent">{authErrorMessage(q.error)}</Text>
            <TokenButton label="Try again" tone="chip" onPress={() => void q.refetch()} />
          </View>
        ) : null}

        {r && tile ? (
          <>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={[styles.tile, { backgroundColor: tile.bg }]} aria-hidden>
                <Text style={styles.tileMark}>{tile.mark}</Text>
              </View>
              <Text style={styles.title} color="sub">
                {titleFor(r, other)}
              </Text>
              <Text
                style={styles.amount}
                color={incoming ? 'money' : 'text'}
                accessibilityLabel={`${incoming ? 'Received' : 'Paid'} ${formatNaira(r.amountKobo)}`}
              >
                {incoming ? '+' : '−'}
                {formatNaira(r.amountKobo)}
              </Text>
              <View style={[styles.pill, { backgroundColor: colors.moneySoft }]}>
                <Svg
                  width={13}
                  height={13}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={colors.money}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M5 12.5l4.5 4.5L19 7.5" />
                </Svg>
                <Text style={[styles.pillText, { color: colors.money }]}>
                  {incoming ? 'Received' : 'Sent'}
                </Text>
              </View>

              <View style={[styles.rows, { borderColor: colors.line }]}>
                {rows.map(([label, value]) => (
                  <View key={label} style={[styles.line, { borderColor: colors.line }]}>
                    <Text variant="footnote" color="sub" style={styles.label}>
                      {label}
                    </Text>
                    <Text variant="footnote" selectable style={styles.value}>
                      {value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.buttons}>
              {other ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open chat"
                  disabled={openChat.isPending}
                  onPress={() =>
                    openChat.mutate(other.id, {
                      onSuccess: (c) => router.push(`/c/${c.id}` as Href),
                    })
                  }
                  style={[styles.button, { backgroundColor: colors.card }]}
                >
                  <Text style={styles.buttonText}>Open chat</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share receipt"
                onPress={() =>
                  void Share.share({
                    message: `Dyce receipt: ${incoming ? 'received' : 'paid'} ${formatNaira(r.amountKobo)}${r.note ? ` for ${r.note}` : ''}. Ref ${r.id}`,
                  })
                }
                style={[styles.button, { backgroundColor: colors.card }]}
              >
                <Text style={styles.buttonText}>Share receipt</Text>
              </Pressable>
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
  content: { paddingHorizontal: 16, paddingBottom: 34, gap: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  backText: { fontSize: 17, fontFamily: 'Figtree_500Medium' },
  block: { gap: 10 },
  card: {
    borderRadius: 26,
    paddingTop: 24,
    paddingHorizontal: 18,
    paddingBottom: 6,
    alignItems: 'center',
  },
  tile: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tileMark: { color: '#FFFFFF', fontSize: 20, fontFamily: 'Figtree_800ExtraBold' },
  title: { fontSize: 15, marginTop: 12, fontFamily: 'Figtree_600SemiBold', textAlign: 'center' },
  amount: { fontSize: 48, letterSpacing: -1.4, fontFamily: 'BricolageGrotesque_800ExtraBold' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  pillText: { fontSize: 13, fontFamily: 'Figtree_700Bold' },
  rows: { alignSelf: 'stretch', marginTop: 20, borderTopWidth: 2, borderStyle: 'dashed' },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  label: { width: 76 },
  value: { flex: 1, textAlign: 'right', fontFamily: 'Figtree_600SemiBold' },
  buttons: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontFamily: 'Figtree_700Bold' },
  center: { textAlign: 'center' },
});
