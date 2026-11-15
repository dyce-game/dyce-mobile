import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira } from '@dyce/shared';
import { Text, TextField, TokenButton, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { authErrorMessage } from '@/features/auth/messages';
import { expiryLabel, newMoneyKey, parseNairaInput } from '../wallet-logic';
import { usePayRequest, useRequestQuery, useWalletQuery } from '../use-wallet';

/**
 * The Pay sheet (design: pay sheet). Everything shown comes from the server for the scanned code: who is
 * asking, how much and what for. A stranger gets a clear "Not in your contacts" warning. The idempotency key
 * is made when you tap Pay and reused on a retry.
 */
export function PayScreen({ code }: { code: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const request = useRequestQuery(code);
  const wallet = useWalletQuery();
  const pay = usePayRequest(code);
  const [amountText, setAmountText] = useState('');
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  const r = request.data;
  const balance = wallet.data?.balanceKobo ?? 0;
  const anyAmount = r?.amountKobo === null;
  const typed = parseNairaInput(amountText);
  const amount = r ? (anyAmount ? typed : r.amountKobo) : null;
  const expired = r
    ? r.status === 'expired' || (r.status === 'open' && expiryLabel(r.expiresAt) === 'Expired')
    : false;
  const payable = !!r && r.status === 'open' && !expired && !r.mine && amount !== null;
  const tooMuch = amount !== null && amount > balance;
  const done = () => (router.canGoBack() ? router.back() : router.replace('/wallet' as Href));
  const name = r ? r.requester.displayName || `@${r.requester.username}` : '';

  function submit() {
    if (!payable || amount === null) return;
    key.current ??= newMoneyKey('pay');
    pay.mutate(
      { amountKobo: anyAmount ? amount : undefined, idempotencyKey: key.current },
      {
        onSuccess: (res) => {
          setReceiptId(res.txnId);
          key.current = null;
        },
      },
    );
  }

  const header = <ScreenHeader title="Pay" fallback="/wallet" />;

  if (receiptId && r && amount !== null) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        <ScrollView contentContainerStyle={styles.content}>
          {header}
          <View style={styles.center} accessibilityLiveRegion="polite">
            <Text variant="title">Paid {formatNaira(amount)}</Text>
            <Text color="sub">
              to {name}
              {r.note ? ` · ${r.note}` : ''}
            </Text>
            <Text variant="footnote" color="sub">
              Balance {formatNaira(pay.data?.balanceKobo ?? balance)}
            </Text>
          </View>
          <TokenButton
            label="View receipt"
            tone="chip"
            onPress={() => router.push(`/wallet/receipt/${receiptId}` as Href)}
          />
          <TokenButton label="Done" onPress={done} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {header}
        {request.isLoading ? <Text color="sub">Looking up that code…</Text> : null}
        {request.isError ? (
          <View style={styles.block}>
            <Text color="accent" accessibilityLiveRegion="polite">
              {authErrorMessage(request.error)}
            </Text>
            <TokenButton label="Back" tone="chip" onPress={done} />
          </View>
        ) : null}

        {r ? (
          <>
            <View
              style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <UserAvatar avatar={r.requester.avatar} name={name} size={56} />
              <Text variant="headline" accessibilityRole="header">
                {name}
              </Text>
              <Text variant="footnote" color="sub">
                @{r.requester.username}
              </Text>
              {!r.mine && r.requester.relationship === 'none' ? (
                <Text variant="footnote" color="accent" accessibilityLiveRegion="polite">
                  Not in your contacts. Only pay people you know.
                </Text>
              ) : null}
              <Text variant="title">
                {r.amountKobo === null ? 'Choose an amount' : formatNaira(r.amountKobo)}
              </Text>
              {r.note ? <Text color="sub">&ldquo;{r.note}&rdquo;</Text> : null}
              <Text variant="footnote" color="sub">
                {expired ? 'Expired' : r.status === 'open' ? expiryLabel(r.expiresAt) : ''}
              </Text>
            </View>

            {r.mine ? (
              <View style={styles.block}>
                <Text color="sub">This is your own request.</Text>
                <TokenButton
                  label="Show my QR"
                  onPress={() => router.replace(`/wallet/request/${code}` as Href)}
                />
              </View>
            ) : r.status !== 'open' || expired ? (
              <View style={styles.block}>
                <Text variant="callout" color="accent">
                  {r.status === 'paid'
                    ? 'This request has already been paid.'
                    : r.status === 'cancelled'
                      ? 'This request was cancelled.'
                      : 'This request has expired. Ask for a new code.'}
                </Text>
                <TokenButton label="Back" tone="chip" onPress={done} />
              </View>
            ) : (
              <>
                {anyAmount ? (
                  <TextField
                    label="Amount (₦)"
                    value={amountText}
                    onChangeText={setAmountText}
                    placeholder="0"
                    keyboardType="number-pad"
                    maxLength={9}
                    leading={
                      <Text color="sub" variant="callout">
                        ₦
                      </Text>
                    }
                  />
                ) : null}
                <Text variant="footnote" color={tooMuch ? 'accent' : 'sub'}>
                  {amount === null
                    ? `Balance ${formatNaira(balance)}`
                    : tooMuch
                      ? `You only have ${formatNaira(balance)}.`
                      : `Balance after ${formatNaira(balance - amount)}`}{' '}
                  · Virtual cash
                </Text>
                {pay.isError ? (
                  <Text color="accent" accessibilityLiveRegion="polite">
                    {authErrorMessage(pay.error)}
                  </Text>
                ) : null}
                <TokenButton
                  label={
                    pay.isPending
                      ? 'Paying…'
                      : amount === null
                        ? 'Pay'
                        : `Pay ${formatNaira(amount)}`
                  }
                  disabled={!payable || tooMuch || pay.isPending}
                  onPress={submit}
                />
                <TokenButton label="Cancel" tone="chip" disabled={pay.isPending} onPress={done} />
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 12 },
  block: { gap: 10 },
  center: { alignItems: 'center', gap: 6, paddingVertical: 28 },
  sheet: { alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 24, padding: 22 },
});
