import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip, ModeBadge, Segmented, Text, TokenButton, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { authErrorMessage } from '@/features/auth/messages';
import { AgeGatePanel } from '@/features/games/components/AgeGatePanel';
import { defaultStake, stakeChipLabel, stakeChoices } from '@/features/games/pool-logic';
import { usePoolInfoQuery } from '@/features/games/use-games';
import {
  ACCEPT_SECONDS,
  acceptSecondsLeft,
  clock,
  endedText,
  isEnded,
  isOpen,
  lookingText,
  modeText,
  opponentLine,
} from './quick-match-logic';
import {
  useAcceptQuickMatch,
  useCancelQuickMatch,
  useDeclineQuickMatch,
  useJoinQuickMatch,
  useQuickMatchQuery,
} from './use-quick-match';

/**
 * Quick match with a stranger (design: QuickMatch): pick a game and Free or Pool, search ("matches go to
 * people near your level first, then widen after 15 seconds"), and when someone is found a card with their
 * level and win rate and 10 seconds to accept. In Pool both stakes are locked when the match is found and
 * come back if either of you walks away. When both accept the game opens in a live space. The server does
 * all of the pairing; this screen only shows the ticket it is given.
 */
export function QuickMatchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const query = useQuickMatchQuery();
  const info = usePoolInfoQuery(true);
  const join = useJoinQuickMatch();
  const cancel = useCancelQuickMatch();
  const accept = useAcceptQuickMatch();
  const decline = useDeclineQuickMatch();

  const games = query.data?.games ?? [];
  const [slug, setSlug] = useState<string | null>(null);
  const [mode, setMode] = useState<'free' | 'pool'>('free');
  const [stake, setStake] = useState<number | null>(null);
  const [askAge, setAskAge] = useState(false);

  // An ended search from before this screen opened is old news: only show what ends while we are here.
  const firstId = useRef<string | null | undefined>(undefined);
  if (firstId.current === undefined && query.data) firstId.current = query.data.ticket?.id ?? null;
  const raw = query.data?.ticket ?? null;
  const ticket = raw && isEnded(raw) && raw.id === firstId.current ? null : raw;

  // When this device first saw the found match: the accept countdown runs from here.
  const seen = useRef<{ id: string; at: number } | null>(null);
  if (ticket?.status === 'found' && seen.current?.id !== ticket.id) {
    seen.current = { id: ticket.id, at: Date.now() };
  }
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (ticket?.status !== 'found') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [ticket?.status]);

  useEffect(() => {
    if (ticket?.status === 'playing' && ticket.spaceId) {
      router.replace(`/space/${ticket.spaceId}` as Href);
    }
  }, [ticket?.status, ticket?.spaceId, router]);

  const game = games.find((g) => g.slug === (slug ?? games[0]?.slug)) ?? null;
  const choices = stakeChoices(info.data);
  const chosenStake = stake ?? defaultStake(choices);
  const minor = info.data ? !info.data.isAdult && info.data.ageAnswered : false;
  const pool = mode === 'pool' && !!game?.supportsPool;

  function pickPool() {
    if (minor) return;
    if (info.data && !info.data.isAdult) {
      setAskAge(true);
      return;
    }
    setMode('pool');
  }

  function start() {
    if (!game) return;
    join.mutate({
      gameSlug: game.slug,
      mode: pool ? 'pool' : 'free',
      stakeKobo: pool ? chosenStake : 0,
    });
  }

  function leave() {
    if (ticket && isOpen(ticket)) {
      (ticket.status === 'found' ? decline : cancel).mutate(ticket.id);
    }
    if (router.canGoBack()) router.back();
    else router.replace('/spaces' as Href);
  }

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        onPress={leave}
        style={styles.side}
      >
        <Text color="accent" style={styles.cancel}>
          Cancel
        </Text>
      </Pressable>
      <Text variant="callout" accessibilityRole="header">
        Quick match
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

  // ---- found: someone to play ----
  if (ticket?.status === 'found' && ticket.opponent) {
    const o = ticket.opponent;
    const left = acceptSecondsLeft(seen.current?.at ?? now, now);
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        {header}
        <View style={styles.center}>
          <Text variant="footnote" color="sub" style={styles.found}>
            MATCH FOUND
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <UserAvatar avatar={o.avatar} name={o.displayName || o.username} size={96} />
            <Text variant="title" accessibilityRole="header">
              @{o.username}
            </Text>
            <Text color="sub">{opponentLine(ticket)}</Text>
            <ModeBadge kind={ticket.mode === 'pool' ? 'POOL' : 'FREE'} />
            <Text variant="footnote" color="sub" style={styles.centerText}>
              {ticket.gameName} · {modeText(ticket)}
            </Text>
          </View>
          {ticket.accepted ? (
            <Text accessibilityLiveRegion="polite" style={styles.centerText}>
              Waiting for @{o.username}…
            </Text>
          ) : (
            <View style={styles.buttons}>
              <TokenButton
                label={left > 0 ? `Accept · ${clock(left)}` : 'Out of time'}
                tone={ticket.mode === 'pool' ? 'ember' : 'felt'}
                disabled={left === 0 || accept.isPending}
                onPress={() => accept.mutate(ticket.id)}
              />
              <TokenButton
                label="Skip"
                tone="chip"
                disabled={decline.isPending}
                onPress={() => decline.mutate(ticket.id)}
              />
            </View>
          )}
          {accept.isError ? (
            <Text variant="footnote" style={{ color: colors.danger }} accessibilityRole="alert">
              {authErrorMessage(accept.error)}
            </Text>
          ) : null}
          <Text variant="footnote" color="sub" style={styles.centerText}>
            You have {ACCEPT_SECONDS} seconds. Strangers can't see your number or contacts.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---- searching ----
  if (ticket?.status === 'searching' || (ticket?.status === 'playing' && !ticket.spaceId)) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        {header}
        <View style={styles.center}>
          <Text variant="footnote" color="sub">
            {ticket.gameName} · {ticket.mode === 'pool' ? 'Pool' : 'Free'} · Similar skill
          </Text>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text variant="title" accessibilityRole="header" accessibilityLiveRegion="polite">
            Finding an opponent…
          </Text>
          <Text color="sub" style={styles.centerText}>
            {lookingText(ticket.lookingCount)} · usually under 10s
          </Text>
          <Text variant="footnote" color="sub" style={styles.centerText}>
            Matches go to people near your level first, then widen after 15 seconds. Strangers can't
            see your number or contacts.
          </Text>
          <TokenButton
            label="Stop searching"
            tone="chip"
            disabled={cancel.isPending}
            onPress={() => cancel.mutate(ticket.id)}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ---- pick a game ----
  const ended = ticket && isEnded(ticket) ? endedText(ticket) : null;
  const canPool = !!game?.supportsPool;
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        <Text color="sub">
          Play someone new, at about your level. You only see their name and level, never their
          number.
        </Text>
        {ended ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            {ended}
          </Text>
        ) : null}

        <Text variant="footnote" color="sub">
          Game
        </Text>
        <View style={styles.chips}>
          {games.map((g) => (
            <Chip
              key={g.slug}
              label={g.name}
              selected={g.slug === game?.slug}
              onPress={() => {
                setSlug(g.slug);
                if (!g.supportsPool) setMode('free');
              }}
            />
          ))}
        </View>

        <Segmented
          label="Free or Pool"
          value={pool ? 'pool' : 'free'}
          onChange={(m) => (m === 'pool' ? pickPool() : setMode('free'))}
          options={[
            { key: 'free', label: 'Free' },
            { key: 'pool', label: minor ? 'Pool (18+)' : canPool ? 'Pool' : 'Pool (not here)' },
          ]}
        />
        {pool ? (
          <View style={styles.stakes}>
            <Text variant="footnote" color="sub">
              Stake each
            </Text>
            <View style={styles.chips}>
              {choices.map((c) => (
                <Chip
                  key={c}
                  label={stakeChipLabel(c)}
                  selected={c === chosenStake}
                  onPress={() => setStake(c)}
                />
              ))}
            </View>
            <Text variant="footnote" color="sub">
              Both stakes are locked when a match is found. If either of you skips or runs out of
              time, they come straight back.
            </Text>
          </View>
        ) : (
          <Text variant="footnote" color="sub">
            No cash, just XP and bragging rights.
          </Text>
        )}

        {join.isError ? (
          <Text variant="footnote" style={{ color: colors.danger }} accessibilityRole="alert">
            {authErrorMessage(join.error)}
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <TokenButton
          label={join.isPending ? 'Searching…' : 'Find a match'}
          tone={pool ? 'ember' : 'felt'}
          disabled={!game || join.isPending}
          onPress={start}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  body: { padding: 16, gap: 14, paddingBottom: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stakes: { gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  centerText: { textAlign: 'center' },
  found: { letterSpacing: 1.5 },
  card: { alignItems: 'center', gap: 8, padding: 20, borderRadius: 24, alignSelf: 'stretch' },
  buttons: { gap: 10, alignSelf: 'stretch' },
  footer: { padding: 16, paddingTop: 4 },
});
