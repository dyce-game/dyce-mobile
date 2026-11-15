import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { formatNaira, type Message } from '@dyce/shared';
import { Text, useTheme } from '@dyce/ui';
import { Gradient } from '@/components/Gradient';
import { expiryLabel } from '@/features/wallet/wallet-logic';
import { useCancelRequest } from '@/features/wallet/use-wallet';

type SentMessage = Extract<Message, { kind: 'money_sent' }>;
type RequestMessage = Extract<Message, { kind: 'money_request' }>;

const GIFT_ADDED = [
  [0, '#2BB673'],
  [1, '#13774A'],
] as const;

/** Money sent to you: a green "gift" card (design: RequestMoney, chat). Money sent by you: a quiet white card. */
function SentCard({ message, mine, who }: { message: SentMessage; mine: boolean; who: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { amountKobo, note, txnId } = message.payload;
  const open = () => router.push(`/wallet/receipt/${txnId}` as Href);

  if (!mine) {
    return (
      <Gradient stops={GIFT_ADDED} radius={22} style={styles.card}>
        <View style={styles.giftBody}>
          <Text style={styles.kicker}>{who.toUpperCase()} SENT YOU</Text>
          <Text style={styles.giftAmount}>{formatNaira(amountKobo)}</Text>
          {note ? <Text style={styles.giftNote}>&ldquo;{note}&rdquo;</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${who} sent you ${formatNaira(amountKobo)}. Added to your wallet. Open receipt`}
          onPress={open}
          style={styles.giftCta}
        >
          <Text style={styles.giftCtaText}>Added to your wallet</Text>
        </Pressable>
      </Gradient>
    );
  }
  return (
    <View
      style={[
        styles.card,
        styles.plain,
        { backgroundColor: colors.card, borderColor: colors.line },
      ]}
    >
      <View style={styles.row}>
        <Text style={[styles.kicker, { color: colors.accent, opacity: 1 }]}>YOU SENT</Text>
        <Text variant="footnote" color="sub">
          Delivered
        </Text>
      </View>
      <Text style={styles.plainAmount}>{formatNaira(amountKobo)}</Text>
      {note ? (
        <Text variant="callout" color="sub" style={styles.plainNote}>
          &ldquo;{note}&rdquo;
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`You sent ${formatNaira(amountKobo)}. Open receipt`}
        onPress={open}
        style={[styles.plainButton, { backgroundColor: colors.chip }]}
      >
        <Text style={styles.plainButtonText}>View receipt</Text>
      </Pressable>
    </View>
  );
}

/** A request in a chat (design: RequestMoney, chat): amount, note and status, with Pay for the person asked. */
function RequestCard({
  message,
  mine,
  who,
}: {
  message: RequestMessage;
  mine: boolean;
  who: string;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { amountKobo, note, code, status, expiresAt } = message.payload;
  const cancel = useCancelRequest(code);
  const state = status === 'open' && expiryLabel(expiresAt) === 'Expired' ? 'expired' : status;
  const open = state === 'open';
  const label = mine ? 'YOU REQUESTED' : `${who.toUpperCase()} REQUESTED`;
  const statusText = { open: 'Pending', paid: 'Paid', cancelled: 'Cancelled', expired: 'Expired' }[
    state
  ];

  return (
    <View
      style={[
        styles.card,
        styles.plain,
        { backgroundColor: colors.card, borderColor: colors.line },
      ]}
    >
      <View style={styles.row}>
        <Text style={[styles.kicker, { color: colors.accent, opacity: 1 }]}>{label}</Text>
        <Text
          variant="footnote"
          color={state === 'paid' ? 'money' : 'sub'}
          accessibilityLabel={`Request ${statusText}`}
        >
          {statusText}
        </Text>
      </View>
      <Text style={styles.plainAmount}>
        {amountKobo === null ? 'Any amount' : formatNaira(amountKobo)}
      </Text>
      {note ? (
        <Text variant="callout" color="sub" style={styles.plainNote}>
          &ldquo;{note}&rdquo;
        </Text>
      ) : null}
      {open && !mine ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Pay ${amountKobo === null ? '' : formatNaira(amountKobo)}`.trim()}
          onPress={() => router.push(`/wallet/pay/${code}` as Href)}
          style={[styles.plainButton, { backgroundColor: '#C93E1C' }]}
        >
          <Text style={[styles.plainButtonText, { color: '#FFFFFF' }]}>Pay</Text>
        </Pressable>
      ) : null}
      {open && mine ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show QR"
            onPress={() => router.push(`/wallet/request/${code}` as Href)}
            style={[styles.plainButton, styles.half, { backgroundColor: colors.chip }]}
          >
            <Text style={styles.plainButtonText}>Show QR</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel request"
            disabled={cancel.isPending}
            onPress={() => cancel.mutate()}
            style={[styles.plainButton, styles.half, { backgroundColor: colors.chip }]}
          >
            <Text style={styles.plainButtonText}>
              {cancel.isPending ? 'Cancelling…' : 'Cancel request'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** A money card in a conversation. `who` is the other person's name. */
export function MoneyCard({
  message,
  mine,
  who,
}: {
  message: SentMessage | RequestMessage;
  mine: boolean;
  who: string;
}) {
  return message.kind === 'money_sent' ? (
    <SentCard message={message} mine={mine} who={who} />
  ) : (
    <RequestCard message={message} mine={mine} who={who} />
  );
}

const styles = StyleSheet.create({
  card: { width: 250, borderRadius: 22 },
  plain: { padding: 14, borderWidth: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: {
    color: '#FFFFFF',
    fontSize: 12,
    letterSpacing: 0.4,
    opacity: 0.9,
    fontFamily: 'Figtree_800ExtraBold',
  },
  giftBody: { padding: 16 },
  giftAmount: {
    color: '#FFFFFF',
    fontSize: 38,
    letterSpacing: -1,
    fontFamily: 'BricolageGrotesque_800ExtraBold',
  },
  giftNote: { color: '#FFFFFF', fontSize: 14, opacity: 0.95, fontFamily: 'Figtree_500Medium' },
  giftCta: {
    height: 44,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftCtaText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Figtree_700Bold' },
  plainAmount: { fontSize: 30, fontFamily: 'BricolageGrotesque_800ExtraBold' },
  plainNote: { fontSize: 14 },
  plainButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plainButtonText: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  actions: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
});
