import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { formatNaira } from '@dyce/shared';
import { Text, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { useFriendsQuery } from '@/features/friends/use-friends';
import { Keypad } from '../components/Keypad';
import { SheetFrame } from '../components/SheetFrame';
import { keypadPress } from '../wallet-logic';
import { useCreateRequest } from '../use-wallet';

const QUICK = [1_000, 2_000, 5_000];
const REASONS = ['Suya debt', 'Rematch stake', 'Split the space fee', 'Just because'];

/**
 * Request money (design: RequestMoney): a big amount, quick amounts with an ember ring on the chosen one,
 * "What's it for?" chips, and a Request button. Leave the amount on "Any" to let the payer choose. By default
 * you get a QR code to show (valid 15 minutes); pick a friend under "From" to send it into your chat with them
 * instead (valid 7 days).
 */
export function RequestScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const friends = useFriendsQuery();
  const create = useCreateRequest();

  const [mode, setMode] = useState<'quick' | 'other' | 'any'>('quick');
  const [digits, setDigits] = useState('2000');
  const [reason, setReason] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);

  const list = friends.data?.friends ?? [];
  const target = list.find((f) => f.id === targetId) ?? null;
  const naira = parseInt(digits, 10);
  const any = mode === 'any';
  const ready = any || naira > 0;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/wallet' as Href));

  function submit() {
    if (!ready) return;
    create.mutate(
      {
        amountKobo: any ? undefined : naira * 100,
        note: reason ?? '',
        targetUserId: target?.id,
        delivery: target ? 'chat' : 'qr',
      },
      { onSuccess: (view) => router.replace(`/wallet/request/${view.code}` as Href) },
    );
  }

  const chip = (on: boolean) => [
    styles.chip,
    { backgroundColor: colors.chip, borderColor: on ? '#C93E1C' : 'transparent' },
  ];

  return (
    <SheetFrame label="Request Dyce Cash" onClose={close}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          {target ? `Request from ${target.displayName || target.username}` : 'Request'}
        </Text>
        <Text variant="footnote" color="sub">
          {target ? 'They have to tap Pay' : 'Anyone can scan the QR'}
        </Text>
      </View>

      <Text
        style={[styles.amount, { color: any ? colors.sub : colors.text }]}
        accessibilityLabel={any ? 'Any amount' : `Amount ${formatNaira(naira * 100)}`}
        accessibilityLiveRegion="polite"
      >
        {any ? 'Any amount' : formatNaira(naira * 100)}
      </Text>
      <View style={styles.quick}>
        {QUICK.map((q) => (
          <Pressable
            key={q}
            accessibilityRole="button"
            accessibilityLabel={`Request ${formatNaira(q * 100)}`}
            accessibilityState={{ selected: mode === 'quick' && naira === q }}
            onPress={() => {
              setMode('quick');
              setDigits(String(q));
            }}
            style={chip(mode === 'quick' && naira === q)}
          >
            <Text style={[styles.chipText, { color: colors.text }]}>{formatNaira(q * 100)}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Other amount"
          accessibilityState={{ selected: mode === 'other' }}
          onPress={() => {
            setMode('other');
            setDigits('0');
          }}
          style={chip(mode === 'other')}
        >
          <Text style={[styles.chipText, { color: colors.text }]}>Other</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Any amount"
          accessibilityState={{ selected: any }}
          onPress={() => setMode('any')}
          style={chip(any)}
        >
          <Text style={[styles.chipText, { color: colors.text }]}>Any</Text>
        </Pressable>
      </View>
      {mode === 'other' ? (
        <Keypad onPress={(k) => setDigits((d) => keypadPress(d, k, 200_000))} />
      ) : null}

      <Text style={styles.sectionLabel} color="sub">
        What&apos;s it for?
      </Text>
      <View style={styles.wrap}>
        {REASONS.map((r) => {
          const on = reason === r;
          return (
            <Pressable
              key={r}
              accessibilityRole="button"
              accessibilityLabel={r}
              accessibilityState={{ selected: on }}
              onPress={() => setReason(on ? null : r)}
              style={[styles.reason, { backgroundColor: on ? colors.ink : colors.chip }]}
            >
              <Text style={[styles.reasonText, { color: on ? colors.inkText : colors.text }]}>
                {r}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {list.length > 0 ? (
        <>
          <Text style={styles.sectionLabel} color="sub">
            From
          </Text>
          <View style={styles.wrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Anyone, show a QR code"
              accessibilityState={{ selected: !target }}
              onPress={() => setTargetId(null)}
              style={[styles.reason, { backgroundColor: !target ? colors.ink : colors.chip }]}
            >
              <Text style={[styles.reasonText, { color: !target ? colors.inkText : colors.text }]}>
                Anyone (QR)
              </Text>
            </Pressable>
            {list.slice(0, 8).map((f) => {
              const on = targetId === f.id;
              return (
                <Pressable
                  key={f.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ask @${f.username}`}
                  accessibilityState={{ selected: on }}
                  onPress={() => setTargetId(on ? null : f.id)}
                  style={[styles.reason, { backgroundColor: on ? colors.ink : colors.chip }]}
                >
                  <Text style={[styles.reasonText, { color: on ? colors.inkText : colors.text }]}>
                    {f.displayName || f.username}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {create.isError ? (
        <Text color="accent" accessibilityLiveRegion="polite">
          {authErrorMessage(create.error)}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={any ? 'Request any amount' : `Request ${formatNaira(naira * 100)}`}
        accessibilityState={{ disabled: !ready || create.isPending }}
        disabled={!ready || create.isPending}
        onPress={submit}
        style={[styles.cta, { backgroundColor: ready ? '#C93E1C' : colors.chip }]}
      >
        <Text style={[styles.ctaText, { color: ready ? '#FFFFFF' : colors.sub }]}>
          {create.isPending
            ? 'Creating…'
            : any
              ? 'Request any amount'
              : `Request ${formatNaira(naira * 100)}`}
        </Text>
      </Pressable>
      <Text variant="footnote" color="sub" style={styles.foot}>
        Strangers can&apos;t request from you. Only Dyce friends.
      </Text>
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 18, flexShrink: 1, fontFamily: 'Figtree_800ExtraBold' },
  amount: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 54,
    letterSpacing: -1.5,
    fontFamily: 'BricolageGrotesque_800ExtraBold',
  },
  quick: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  chip: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 2,
    justifyContent: 'center',
  },
  chipText: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
  sectionLabel: { fontSize: 13, fontFamily: 'Figtree_600SemiBold', marginTop: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reason: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22, justifyContent: 'center' },
  reasonText: { fontSize: 13, fontFamily: 'Figtree_600SemiBold' },
  cta: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  ctaText: { fontSize: 17, fontFamily: 'Figtree_700Bold' },
  foot: { textAlign: 'center' },
});
