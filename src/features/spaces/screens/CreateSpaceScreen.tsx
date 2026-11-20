import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatNaira,
  type SpacePayoutScheme,
  type SpaceStartRule,
  type SpaceVisibility,
} from '@dyce/shared';
import { Chip, Segmented, Text, TextField, TokenButton, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { newMessageId } from '@/features/chat/chat-logic';
import { AgeGatePanel } from '@/features/games/components/AgeGatePanel';
import { defaultStake } from '@/features/games/pool-logic';
import { usePoolInfoQuery } from '@/features/games/use-games';
import { useWalletQuery } from '@/features/wallet/use-wallet';
import { SCHEME_LABEL, ordinal, payoutSplit, schemesFor, seatFeeChoices } from '../spaces-logic';
import { useCreateSpace } from '../use-spaces';

const MIN_SEATS = 2;
const MAX_SEATS = 4;

/**
 * Create a space (design: CreateRoom): game, name, Free or Pool, seats, seat fee and payout, who can join and
 * when it starts. Whot! is the only live game so far. In Pool your own seat fee is locked as the space opens
 * (the server does that; if it can't, no space is made). The first time someone picks Pool they answer the
 * age gate.
 */
export function CreateSpaceScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const create = useCreateSpace();
  const info = usePoolInfoQuery(true);
  const wallet = useWalletQuery();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'free' | 'pool'>('free');
  const [seats, setSeats] = useState(4);
  const choices = seatFeeChoices(info.data);
  const [fee, setFee] = useState<number | null>(null);
  const [scheme, setScheme] = useState<SpacePayoutScheme>('p50_30_20');
  const [visibility, setVisibility] = useState<SpaceVisibility>('friends');
  const [startRule, setStartRule] = useState<SpaceStartRule>('host');
  const [askAge, setAskAge] = useState(false);
  // One id per attempt: tapping Create again after a network failure opens the same space, not a second.
  const attempt = useRef<{ key: string; id: string } | null>(null);

  const pool = mode === 'pool';
  const seatFee = fee ?? defaultStake(choices);
  const minor = info.data ? !info.data.isAdult && info.data.ageAnswered : false;
  const schemes = schemesFor(seats);
  const effectiveScheme = schemes.includes(scheme) ? scheme : 'winner_all';
  const potWhenFull = seatFee * seats;
  const trimmed = name.trim();
  const canAfford = (wallet.data?.balanceKobo ?? Infinity) >= seatFee;

  function pickPool() {
    if (minor) return;
    if (info.data && !info.data.isAdult) {
      setAskAge(true);
      return;
    }
    setMode('pool');
  }

  function submit() {
    if (!trimmed) return;
    const key = `${trimmed}:${mode}:${seats}:${seatFee}:${effectiveScheme}:${visibility}:${startRule}`;
    if (attempt.current?.key !== key) attempt.current = { key, id: newMessageId() };
    create.mutate(
      {
        id: attempt.current.id,
        gameSlug: 'whot',
        name: trimmed,
        mode,
        seatFeeKobo: pool ? seatFee : 0,
        payoutScheme: pool ? effectiveScheme : 'winner_all',
        maxSeats: seats,
        visibility,
        startRule,
      },
      {
        onSuccess: (space) => {
          attempt.current = null;
          router.replace(`/space/${space.id}` as Href);
        },
      },
    );
  }

  const cancel = () => (router.canGoBack() ? router.back() : router.replace('/spaces' as Href));

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        onPress={cancel}
        style={styles.side}
      >
        <Text color="accent" style={styles.cancel}>
          Cancel
        </Text>
      </Pressable>
      <Text variant="callout" accessibilityRole="header">
        New space
      </Text>
      <View style={styles.side} />
    </View>
  );

  if (askAge) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        {header}
        <ScrollView contentContainerStyle={styles.body}>
          <AgeGatePanel
            onAdult={() => {
              setAskAge(false);
              setMode('pool');
            }}
            onFree={() => {
              setAskAge(false);
              setMode('free');
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      {header}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View>
          <Text variant="footnote" color="sub" style={styles.label}>
            Game
          </Text>
          <View
            accessible
            accessibilityLabel="Whot!, selected. More games are coming."
            style={[styles.game, { backgroundColor: colors.card, borderColor: '#C93E1C' }]}
          >
            <View style={styles.gameMark}>
              <Text style={styles.gameMarkText}>W</Text>
            </View>
            <View style={styles.flex}>
              <Text variant="callout">Whot!</Text>
              <Text variant="footnote" color="sub">
                2–4 players · Nigerian rules
              </Text>
            </View>
          </View>
        </View>

        <TextField
          label="Space name"
          value={name}
          onChangeText={setName}
          placeholder="Sunday game night"
          maxLength={32}
          autoCapitalize="sentences"
          returnKeyType="done"
        />

        <Segmented
          label="Free or Pool"
          value={mode}
          onChange={(m) => (m === 'pool' ? pickPool() : setMode('free'))}
          options={[
            { key: 'free', label: 'Free space' },
            { key: 'pool', label: minor ? 'Pool (18+)' : 'Pool space' },
          ]}
        />

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.row, { borderColor: colors.line }]}>
            <View style={styles.flex}>
              <Text variant="body">Players</Text>
              <Text variant="footnote" color="sub">
                {MIN_SEATS}–{MAX_SEATS} players for Whot!
              </Text>
            </View>
            <View style={[styles.stepper, { backgroundColor: colors.chip }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fewer players"
                disabled={seats <= MIN_SEATS}
                onPress={() => setSeats((n) => Math.max(MIN_SEATS, n - 1))}
                style={[
                  styles.stepBtn,
                  { backgroundColor: colors.card, opacity: seats <= MIN_SEATS ? 0.4 : 1 },
                ]}
              >
                <Text variant="headline">−</Text>
              </Pressable>
              <Text
                variant="headline"
                style={styles.seatCount}
                accessibilityLabel={`${seats} players`}
              >
                {seats}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More players"
                disabled={seats >= MAX_SEATS}
                onPress={() => setSeats((n) => Math.min(MAX_SEATS, n + 1))}
                style={[
                  styles.stepBtn,
                  { backgroundColor: colors.card, opacity: seats >= MAX_SEATS ? 0.4 : 1 },
                ]}
              >
                <Text variant="headline">+</Text>
              </Pressable>
            </View>
          </View>
          {pool ? (
            <View style={styles.poolBox}>
              <Text variant="body">Entry per seat</Text>
              <View style={styles.chips}>
                {choices.map((c) => (
                  <Chip
                    key={c}
                    label={formatNaira(c)}
                    selected={c === seatFee}
                    onPress={() => setFee(c)}
                  />
                ))}
              </View>
              <Text variant="body">Payout</Text>
              <View style={styles.chips}>
                {schemes.map((s) => (
                  <Chip
                    key={s}
                    label={SCHEME_LABEL[s]}
                    selected={s === effectiveScheme}
                    onPress={() => setScheme(s)}
                  />
                ))}
              </View>
            </View>
          ) : (
            <Text variant="footnote" color="sub" style={styles.freeNote}>
              No entry, no cash. Anyone can join with a ₦0 balance.
            </Text>
          )}
        </View>

        {pool ? (
          <View
            style={styles.pot}
            accessible
            accessibilityLabel={`Pool when full ${formatNaira(potWhenFull)}`}
          >
            <View style={styles.potTop}>
              <Text variant="footnote" style={{ color: '#C9C9D1' }}>
                Pool when full
              </Text>
              <Text style={styles.potAmount}>{formatNaira(potWhenFull)}</Text>
            </View>
            <View style={styles.potRow}>
              {payoutSplit(potWhenFull, effectiveScheme, seats).map((p) => (
                <View key={p.place} style={styles.potCell}>
                  <Text style={styles.potKobo}>{formatNaira(p.kobo)}</Text>
                  <Text variant="footnote" style={{ color: '#C9C9D1' }}>
                    {ordinal(p.place)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View>
          <Text variant="footnote" color="sub" style={styles.label}>
            Who can join
          </Text>
          <Segmented
            label="Who can join"
            value={visibility}
            onChange={setVisibility}
            options={[
              { key: 'friends', label: 'Friends only' },
              { key: 'invite', label: 'Anyone with the code' },
            ]}
          />
        </View>
        <View>
          <Text variant="footnote" color="sub" style={styles.label}>
            Start
          </Text>
          <Segmented
            label="When the game starts"
            value={startRule}
            onChange={setStartRule}
            options={[
              { key: 'host', label: 'Host starts' },
              { key: 'when_full', label: 'When full' },
            ]}
          />
        </View>

        {create.isError ? (
          <Text variant="footnote" style={{ color: colors.danger }} accessibilityRole="alert">
            {authErrorMessage(create.error)}
          </Text>
        ) : null}
        {pool && !canAfford ? (
          <Text variant="footnote" style={{ color: colors.danger }} accessibilityRole="alert">
            You need {formatNaira(seatFee)} in your wallet to take the first seat.
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <TokenButton
          label={
            create.isPending
              ? 'Creating…'
              : pool
                ? `Create space · pay ${formatNaira(seatFee)}`
                : 'Create free space'
          }
          tone={pool ? 'ember' : 'felt'}
          disabled={!trimmed || create.isPending || (pool && !canAfford)}
          onPress={submit}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  side: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  cancel: { fontSize: 17 },
  body: { padding: 16, gap: 16, paddingBottom: 24 },
  label: { marginBottom: 8 },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 18,
    borderWidth: 3,
    minHeight: 64,
  },
  gameMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#8C2A43',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameMarkText: { color: '#fff', fontSize: 20, fontFamily: 'Figtree_800ExtraBold' },
  card: { borderRadius: 18, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', padding: 3, borderRadius: 12, gap: 4 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatCount: { width: 30, textAlign: 'center' },
  poolBox: { padding: 14, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freeNote: { padding: 14, lineHeight: 19 },
  pot: { borderRadius: 18, padding: 14, backgroundColor: '#1B140F', gap: 8 },
  potTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  potAmount: { color: '#9DF2BE', fontSize: 28, fontFamily: 'BricolageGrotesque_800ExtraBold' },
  potRow: { flexDirection: 'row', gap: 6 },
  potCell: { flex: 1, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)', padding: 8 },
  potKobo: { color: '#fff', fontFamily: 'Figtree_800ExtraBold', fontSize: 14 },
  footer: { padding: 16, paddingTop: 4 },
});
