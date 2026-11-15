import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira } from '@dyce/shared';
import { Chip, Text, TextField, TokenButton, useTheme } from '@dyce/ui';
import { PillButton } from '@/components/PillButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { authErrorMessage } from '@/features/auth/messages';
import { FriendRow } from '@/features/friends/components/FriendRow';
import { useFriendsQuery } from '@/features/friends/use-friends';
import { AMOUNT_PRESETS, parseNairaInput } from '../wallet-logic';
import { useCreateRequest } from '../use-wallet';

/**
 * Request money (design: SendMoney/Request). Leave the amount empty for "any amount". By default you get a
 * QR code to show in person (valid 15 minutes); pick a friend to send the request into your chat instead
 * (valid 7 days).
 */
export function RequestScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const friends = useFriendsQuery();
  const create = useCreateRequest();
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);

  const list = friends.data?.friends ?? [];
  const target = list.find((f) => f.id === targetId) ?? null;
  const amount = parseNairaInput(amountText);
  const amountError =
    amountText.trim() && amount === null
      ? 'Enter a whole-naira amount, or leave it empty.'
      : undefined;

  function submit() {
    if (amountError) return;
    create.mutate(
      {
        amountKobo: amount ?? undefined,
        note: note.trim(),
        targetUserId: target?.id,
        delivery: target ? 'chat' : 'qr',
      },
      { onSuccess: (view) => router.replace(`/wallet/request/${view.code}` as Href) },
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Request" fallback="/wallet" />
        <TextField
          label="Amount (₦, optional)"
          value={amountText}
          onChangeText={setAmountText}
          placeholder="Any amount"
          keyboardType="number-pad"
          maxLength={9}
          error={amountError}
          hint="Leave empty to let the payer choose."
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

        <Text variant="caption" color="sub" accessibilityRole="header">
          From
        </Text>
        <Text variant="footnote" color="sub">
          {target
            ? `Sent to ${target.displayName || target.username} in your chat.`
            : 'Anyone: you get a QR code to show.'}
        </Text>
        {target ? (
          <FriendRow
            name={target.displayName}
            username={target.username}
            right={<PillButton label="Anyone" onPress={() => setTargetId(null)} />}
          />
        ) : (
          list.map((f) => (
            <FriendRow
              key={f.id}
              name={f.displayName}
              username={f.username}
              right={
                <PillButton
                  label="Ask"
                  accessibilityLabel={`Ask @${f.username}`}
                  onPress={() => setTargetId(f.id)}
                />
              }
            />
          ))
        )}

        {create.isError ? (
          <Text color="accent" accessibilityLiveRegion="polite">
            {authErrorMessage(create.error)}
          </Text>
        ) : null}
        <TokenButton
          label={create.isPending ? 'Creating…' : target ? 'Send request' : 'Show QR code'}
          disabled={create.isPending || !!amountError}
          onPress={submit}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 12 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
