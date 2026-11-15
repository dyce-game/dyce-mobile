import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { formatNaira } from '@dyce/shared';
import { MAX_FONT_SCALE, Text, TokenButton, useTheme } from '@dyce/ui';
import { InitialAvatar } from '@/components/InitialAvatar';
import { PillButton } from '@/components/PillButton';
import { authErrorMessage } from '@/features/auth/messages';
import { FriendRow } from '@/features/friends/components/FriendRow';
import { useFriendsQuery } from '@/features/friends/use-friends';
import { Keypad } from '../components/Keypad';
import { SheetFrame } from '../components/SheetFrame';
import { keypadPress, newMoneyKey } from '../wallet-logic';
import { useSendMoney, useWalletQuery } from '../use-wallet';

const QUICK = [500, 1_000, 5_000];
const MAX_NAIRA = 200_000;

/**
 * Send Dyce Cash (design: SendMoney): a sheet with who it's going to, a big amount, quick amounts, a note and
 * the keypad. "Send" leads to a short confirm step ("Virtual cash · can't be undone"), then success. The
 * idempotency key is made at confirm and reused on a retry, so a bad connection can't send twice. Opened from a
 * chat's ₦ button it already knows the person; from the Wallet it starts with a friend picker.
 */
export function SendScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { to } = useLocalSearchParams<{ to?: string }>();
  const friends = useFriendsQuery();
  const wallet = useWalletQuery();
  const send = useSendMoney();

  const [toId, setToId] = useState<string | null>(typeof to === 'string' ? to : null);
  const [digits, setDigits] = useState('0');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'amount' | 'confirm' | 'done'>('amount');
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  const list = friends.data?.friends ?? [];
  const recipient = list.find((f) => f.id === toId) ?? null;
  const naira = parseInt(digits, 10);
  const amount = naira * 100;
  const limits = wallet.data?.limits;
  const balance = wallet.data?.balanceKobo ?? 0;
  const name = recipient ? recipient.displayName || recipient.username : '';

  const amountError =
    naira > 0 && limits && amount > limits.perSendKobo
      ? `The most you can send at once is ${formatNaira(limits.perSendKobo)}.`
      : naira > 0 && amount > balance
        ? `You only have ${formatNaira(balance)}.`
        : undefined;
  const ready = !!recipient && naira > 0 && !amountError;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/wallet' as Href));

  function confirm() {
    if (!recipient || !ready) return;
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

  return (
    <SheetFrame label="Send Dyce Cash" onClose={close}>
      {!recipient ? (
        <>
          <Text variant="headline" accessibilityRole="header">
            Send to
          </Text>
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
      ) : step === 'done' ? (
        <View style={styles.center} accessibilityLiveRegion="polite">
          <Text variant="title">Sent {formatNaira(amount)}</Text>
          <Text color="sub">
            to {name}
            {note.trim() ? ` · ${note.trim()}` : ''}
          </Text>
          <Text variant="footnote" color="sub">
            Balance {formatNaira(send.data?.balanceKobo ?? balance)}
          </Text>
          {receiptId ? (
            <TokenButton
              label="View receipt"
              tone="chip"
              onPress={() => router.replace(`/wallet/receipt/${receiptId}` as Href)}
            />
          ) : null}
          <TokenButton label="Done" onPress={close} />
        </View>
      ) : step === 'confirm' ? (
        <View style={styles.center}>
          <InitialAvatar name={name} size={56} />
          <Text variant="title" accessibilityRole="header">
            Send {formatNaira(amount)}?
          </Text>
          <Text color="sub">
            to {name} (@{recipient.username})
          </Text>
          {note.trim() ? <Text variant="footnote">&ldquo;{note.trim()}&rdquo;</Text> : null}
          <Text variant="footnote" color="sub">
            Virtual cash · can&apos;t be undone
          </Text>
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
            onPress={() => setStep('amount')}
          />
        </View>
      ) : (
        <>
          <View style={styles.who}>
            <InitialAvatar name={name} size={40} />
            <View style={styles.whoText}>
              <Text variant="footnote" color="sub">
                Send to
              </Text>
              <Text style={styles.whoName} numberOfLines={1}>
                {name} · @{recipient.username}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change recipient"
              onPress={() => setToId(null)}
              style={styles.change}
            >
              <Text variant="footnote" color="sub">
                Bal {formatNaira(balance, { compact: true })}
              </Text>
            </Pressable>
          </View>

          <Text
            style={[styles.amount, { color: naira > 0 ? colors.text : colors.sub }]}
            accessibilityLabel={`Amount ${formatNaira(amount)}`}
            accessibilityLiveRegion="polite"
          >
            {formatNaira(amount)}
          </Text>
          <View style={styles.quick}>
            {QUICK.map((q) => (
              <Pressable
                key={q}
                accessibilityRole="button"
                accessibilityLabel={`Set amount to ${formatNaira(q * 100)}`}
                onPress={() => setDigits(String(q))}
                style={[styles.quickChip, { backgroundColor: colors.chip }]}
              >
                <Text style={[styles.quickText, { color: colors.text }]}>
                  {formatNaira(q * 100)}
                </Text>
              </Pressable>
            ))}
          </View>
          {amountError ? (
            <Text
              variant="footnote"
              color="accent"
              style={styles.errorText}
              accessibilityLiveRegion="polite"
            >
              {amountError}
            </Text>
          ) : null}

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="What's it for? (optional)"
            placeholderTextColor={colors.sub}
            accessibilityLabel="Note"
            maxLength={140}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[styles.note, { backgroundColor: colors.chip, color: colors.text }]}
          />
          <Keypad onPress={(k) => setDigits((d) => keypadPress(d, k, MAX_NAIRA))} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Send ${formatNaira(amount)}`}
            accessibilityState={{ disabled: !ready }}
            disabled={!ready}
            onPress={() => setStep('confirm')}
            style={[styles.send, { backgroundColor: ready ? '#C93E1C' : colors.chip }]}
          >
            <Text style={[styles.sendText, { color: ready ? '#FFFFFF' : colors.sub }]}>
              Send {formatNaira(amount)}
            </Text>
          </Pressable>
        </>
      )}
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  whoText: { flex: 1, minWidth: 0 },
  whoName: { fontSize: 16, fontFamily: 'Figtree_700Bold' },
  change: { minHeight: 44, justifyContent: 'center' },
  amount: {
    textAlign: 'center',
    marginTop: 10,
    fontSize: 56,
    letterSpacing: -1.5,
    fontFamily: 'BricolageGrotesque_800ExtraBold',
  },
  quick: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  quickChip: { height: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center' },
  quickText: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  errorText: { textAlign: 'center' },
  note: {
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: 'Figtree_400Regular',
    marginTop: 6,
  },
  send: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  sendText: { fontSize: 17, fontFamily: 'Figtree_700Bold' },
});
