import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira } from '@dyce/shared';
import { Chip, Text, TextField, TokenButton, useTheme } from '@dyce/ui';
import { InitialAvatar } from '@/components/InitialAvatar';
import { PillButton } from '@/components/PillButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { authErrorMessage } from '@/features/auth/messages';
import { FriendRow } from '@/features/friends/components/FriendRow';
import { useFriendsQuery } from '@/features/friends/use-friends';
import { AMOUNT_PRESETS, newMoneyKey, parseNairaInput } from '../wallet-logic';
import { useSendMoney, useWalletQuery } from '../use-wallet';

type Step = 'form' | 'confirm' | 'done';

/**
 * Send Dyce Cash to a friend (design: SendMoney). Choose who, how much and an optional note, then a confirm
 * step that shows the full amount and says it can't be undone. The idempotency key is made when you reach
 * Confirm and reused on a retry, so a bad connection can't send twice.
 */
export function SendScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { to } = useLocalSearchParams<{ to?: string }>();
  const friends = useFriendsQuery();
  const wallet = useWalletQuery();
  const send = useSendMoney();

  const [toId, setToId] = useState<string | null>(typeof to === 'string' ? to : null);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  const list = friends.data?.friends ?? [];
  const recipient = list.find((f) => f.id === toId) ?? null;
  const amount = parseNairaInput(amountText);
  const limits = wallet.data?.limits;
  const balance = wallet.data?.balanceKobo ?? 0;

  const amountError =
    amountText.trim() && amount === null
      ? 'Enter a whole-naira amount.'
      : amount !== null && limits && amount > limits.perSendKobo
        ? `The most you can send at once is ${formatNaira(limits.perSendKobo)}.`
        : amount !== null && amount > balance
          ? `You only have ${formatNaira(balance)}.`
          : undefined;
  const ready = !!recipient && amount !== null && !amountError;

  function confirm() {
    if (!recipient || amount === null) return;
    key.current ??= newMoneyKey('send');
    send.mutate(
      {
        toUserId: recipient.id,
        amountKobo: amount,
        note: note.trim(),
        idempotencyKey: key.current,
      },
      {
        onSuccess: (r) => {
          setReceiptId(r.txnId);
          setStep('done');
          key.current = null;
        },
      },
    );
  }

  const header = <ScreenHeader title="Send" fallback="/wallet" />;

  if (step === 'done' && recipient && amount !== null) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        <ScrollView contentContainerStyle={styles.content}>
          {header}
          <View style={styles.center} accessibilityLiveRegion="polite">
            <Text variant="title">Sent {formatNaira(amount)}</Text>
            <Text color="sub">
              to {recipient.displayName || `@${recipient.username}`}
              {note.trim() ? ` · ${note.trim()}` : ''}
            </Text>
            <Text variant="footnote" color="sub">
              Balance {formatNaira(send.data?.balanceKobo ?? balance)}
            </Text>
          </View>
          {receiptId ? (
            <TokenButton
              label="View receipt"
              tone="chip"
              onPress={() => router.push(`/wallet/receipt/${receiptId}` as Href)}
            />
          ) : null}
          <TokenButton
            label="Done"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/wallet' as Href))}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'confirm' && recipient && amount !== null) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        <ScrollView contentContainerStyle={styles.content}>
          {header}
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <InitialAvatar name={recipient.displayName || recipient.username} size={56} />
            <Text variant="title" accessibilityRole="header">
              Send {formatNaira(amount)}?
            </Text>
            <Text color="sub">
              to {recipient.displayName || recipient.username} (@{recipient.username})
            </Text>
            {note.trim() ? <Text variant="footnote">&ldquo;{note.trim()}&rdquo;</Text> : null}
            <Text variant="footnote" color="sub">
              Virtual cash · can&apos;t be undone
            </Text>
          </View>
          {send.isError ? (
            <Text color="accent" accessibilityLiveRegion="polite">
              {authErrorMessage(send.error)}
            </Text>
          ) : null}
          <TokenButton
            label={send.isPending ? 'Sending…' : `Send ${formatNaira(amount)}`}
            disabled={send.isPending}
            onPress={confirm}
          />
          <TokenButton
            label="Back"
            tone="chip"
            disabled={send.isPending}
            onPress={() => setStep('form')}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {header}

        <Text variant="caption" color="sub" accessibilityRole="header">
          To
        </Text>
        {recipient ? (
          <FriendRow
            name={recipient.displayName}
            username={recipient.username}
            right={<PillButton label="Change" onPress={() => setToId(null)} />}
          />
        ) : (
          <>
            {friends.isLoading ? <Text color="sub">Loading your friends…</Text> : null}
            {friends.isSuccess && list.length === 0 ? (
              <Text color="sub">
                You can send Dyce Cash to friends. Add a friend first, or pay someone&apos;s request
                code.
              </Text>
            ) : null}
            {list.map((f) => (
              <FriendRow
                key={f.id}
                name={f.displayName}
                username={f.username}
                right={
                  <PillButton
                    label="Choose"
                    tone="primary"
                    accessibilityLabel={`Send to @${f.username}`}
                    onPress={() => setToId(f.id)}
                  />
                }
              />
            ))}
          </>
        )}

        {recipient ? (
          <>
            <TextField
              label="Amount (₦)"
              value={amountText}
              onChangeText={setAmountText}
              placeholder="0"
              keyboardType="number-pad"
              maxLength={9}
              error={amountError}
              hint={limits ? `Up to ${formatNaira(limits.perSendKobo)} at a time.` : undefined}
              leading={
                <Text color="sub" variant="callout">
                  ₦
                </Text>
              }
            />
            <View style={styles.chips}>
              {AMOUNT_PRESETS.map((n) => (
                <Chip
                  key={n}
                  label={formatNaira(n * 100, { compact: true })}
                  onPress={() => setAmountText(String(n))}
                />
              ))}
            </View>
            <TextField
              label="Note (optional)"
              value={note}
              onChangeText={setNote}
              placeholder="What's it for?"
              maxLength={140}
            />
            <Text variant="footnote" color="sub">
              Balance {formatNaira(balance)} · Virtual cash
            </Text>
            <TokenButton label="Review" disabled={!ready} onPress={() => setStep('confirm')} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 12 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  center: { alignItems: 'center', gap: 6, paddingVertical: 28 },
  sheet: {
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 24,
    padding: 22,
    marginTop: 8,
  },
});
