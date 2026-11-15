import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { formatNaira, type Message } from '@dyce/shared';
import { Text, brand, useTheme } from '@dyce/ui';
import { PillButton } from '@/components/PillButton';
import { expiryLabel } from '@/features/wallet/wallet-logic';

type MoneyMessage = Extract<Message, { kind: 'money_sent' | 'money_request' }>;

/**
 * "Sent ₦5,000" / "Paid ₦2,000" / "Requested ₦2,000" in a conversation. A sent card opens its receipt; a
 * request card has a Pay button for the person asked, and "Show QR" for the person who asked.
 */
export function MoneyCard({ message, mine }: { message: MoneyMessage; mine: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const go = (href: string) => router.push(href as Href);

  if (message.kind === 'money_sent') {
    const { amountKobo, note, txnId } = message.payload;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${message.body}. Open receipt`}
        onPress={() => go(`/wallet/receipt/${txnId}`)}
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}
      >
        <View style={[styles.glyph, { backgroundColor: colors.brandSoft }]} aria-hidden>
          <Text variant="headline" color="accent">
            ₦
          </Text>
        </View>
        <View style={styles.body}>
          <Text variant="callout" numberOfLines={1}>
            {message.body.split(' · ')[0]}
          </Text>
          <Text variant="footnote" color="sub" numberOfLines={1}>
            {note || (mine ? 'You sent this' : 'Sent to you')}
          </Text>
        </View>
        <Text variant="callout" color={mine ? 'text' : 'money'}>
          {mine ? '−' : '+'}
          {formatNaira(amountKobo, { compact: true })}
        </Text>
      </Pressable>
    );
  }

  const { amountKobo, note, code, status, expiresAt } = message.payload;
  const expired = status === 'open' && expiryLabel(expiresAt) === 'Expired';
  const state = expired ? 'expired' : status;
  const open = state === 'open';
  return (
    <View style={[styles.requestCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.row}>
        <View style={[styles.glyph, { backgroundColor: colors.brandSoft }]} aria-hidden>
          <Text variant="headline" color="accent">
            ₦
          </Text>
        </View>
        <View style={styles.body}>
          <Text variant="callout" numberOfLines={1}>
            {amountKobo === null ? 'Requested money' : `Requested ${formatNaira(amountKobo)}`}
          </Text>
          <Text variant="footnote" color="sub" numberOfLines={1}>
            {note || (mine ? 'You asked' : 'Asked you')}
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        <View
          style={[
            styles.status,
            { backgroundColor: state === 'paid' ? brand.felt.fill : colors.chip },
          ]}
          accessible
          accessibilityLabel={`Request ${state}`}
        >
          <Text
            variant="caption"
            style={{ color: state === 'paid' ? brand.felt.text : colors.sub }}
          >
            {state}
          </Text>
        </View>
        <View style={styles.grow} />
        {open && !mine ? (
          <PillButton label="Pay" tone="primary" onPress={() => go(`/wallet/pay/${code}`)} />
        ) : null}
        {open && mine ? (
          <PillButton label="Show QR" onPress={() => go(`/wallet/request/${code}`)} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: 250,
    minHeight: 64,
    padding: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  requestCard: { width: 250, padding: 10, gap: 10, borderRadius: 20, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  glyph: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  grow: { flex: 1 },
  status: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
});
