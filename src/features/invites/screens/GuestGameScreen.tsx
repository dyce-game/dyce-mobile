import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { GuestSession, InvitePublic, MatchPlayer } from '@dyce/shared';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { WordChips, WordHuntBoard } from '@/features/games/boards/WordHuntBoard';
import { parseWordHuntView, type WordHuntView } from '@/features/games/games-logic';
import { invitesApi } from '@/lib/api';
import { track } from '@/lib/analytics';
import { DyceMark, InviteFrame, usePageColor } from '../components/InviteFrame';
import { guestSummary } from '../invite-link';
import { guestTokenStore } from '../pending-invite';
import { useInviteQuery } from '../use-invites';
import { StoreButtons } from './InviteLandingScreen';

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'ready'; session: GuestSession };

type Action = { kind: 'start' } | { kind: 'submit'; words: string[] };

/**
 * The guest round in a browser (design: WebGame, WebGameEnd). The Word Hunt board is the same one signed-in
 * players use; the only difference is where moves go: to the guest run behind this invite, secured by a
 * secret kept in this browser. The server holds the grid, the clock and the score.
 */
export function GuestGameScreen({ token }: { token: string }) {
  const router = useRouter();
  const invite = useInviteQuery(token);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | undefined>();
  const secret = useRef<string | null>(null);

  const fail = useCallback((err: unknown) => {
    const code = err instanceof ApiError ? err.code : 'unknown';
    setPhase({ kind: 'error', code, message: authErrorMessage(err) });
  }, []);

  const begin = useCallback(
    async (retried = false) => {
      try {
        const saved = await guestTokenStore.get(token);
        const session = await invitesApi.startGuest(token, saved);
        secret.current = session.guestToken ?? saved;
        if (session.guestToken) await guestTokenStore.set(token, session.guestToken);
        setPhase({ kind: 'ready', session });
      } catch (err) {
        // A stale secret (an hour old, or replaced): forget it once and ask for a fresh run.
        if (err instanceof ApiError && err.code === 'guest_unauthorized' && !retried) {
          await guestTokenStore.clear(token);
          return begin(true);
        }
        fail(err);
      }
    },
    [token, fail],
  );

  useEffect(() => {
    void begin();
  }, [begin]);

  async function onMove(action: Action) {
    if (!secret.current || busy) return;
    setBusy(true);
    setMoveError(undefined);
    try {
      const session = await invitesApi.guestMove(token, secret.current, action);
      setPhase({ kind: 'ready', session });
      if (action.kind === 'submit') track({ name: 'guest_round_finished' });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'network') setMoveError(authErrorMessage(err));
      else fail(err);
    } finally {
      setBusy(false);
    }
  }

  if (phase.kind === 'loading' || invite.isLoading) {
    return (
      <InviteFrame>
        <Text color="sub" accessibilityLiveRegion="polite">
          Getting your round ready…
        </Text>
      </InviteFrame>
    );
  }

  if (phase.kind === 'error' || !invite.data) {
    const code = phase.kind === 'error' ? phase.code : 'unknown';
    const joinable = code === 'guest_already_played' || code === 'guest_unauthorized';
    return (
      <InviteFrame>
        <View style={styles.errorBox}>
          <Text variant="title" accessibilityRole="header">
            {code === 'invite_expired' ? 'This invite has expired' : "We can't start your round"}
          </Text>
          <Text color="sub">
            {phase.kind === 'error' ? phase.message : authErrorMessage(invite.error)}
          </Text>
        </View>
        <StoreButtons
          primary
          joinLabel={joinable ? 'Sign up for Dyce' : 'Get Dyce'}
          onJoin={() => router.replace((joinable ? `/i/${token}/join` : '/welcome') as Href)}
        />
        <TokenButton
          label="Back to the invite"
          tone="chip"
          onPress={() => router.replace(`/i/${token}` as Href)}
        />
      </InviteFrame>
    );
  }

  const { session } = phase;
  const view = parseWordHuntView(session.view);
  if (!view) {
    return (
      <InviteFrame>
        <Text color="sub">This game can&apos;t be shown in the browser yet.</Text>
      </InviteFrame>
    );
  }

  if (session.runState === 'done') {
    return <GuestEnd token={token} invite={invite.data} view={view} guestId={session.guestId} />;
  }

  return (
    <GuestBoard
      token={token}
      invite={invite.data}
      session={session}
      view={view}
      busy={busy}
      error={moveError}
      onMove={(a) => void onMove(a)}
    />
  );
}

function GuestBoard({
  token,
  invite,
  session,
  view,
  busy,
  error,
  onMove,
}: {
  token: string;
  invite: InvitePublic;
  session: GuestSession;
  view: WordHuntView;
  busy: boolean;
  error?: string;
  onMove: (a: Action) => void;
}) {
  const page = usePageColor();
  const { colors } = useTheme();
  const inviterName = invite.inviter.displayName || invite.inviter.username;
  const players: MatchPlayer[] = [
    synthetic(session.guestId, 'You', 'you', null, 1, true),
    synthetic(
      session.hostId,
      inviterName,
      invite.inviter.username,
      invite.inviter.avatar,
      2,
      false,
    ),
  ];
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: page }]}>
      <View style={styles.bar}>
        <DyceMark size={26} />
        <Text variant="callout" style={styles.flex} numberOfLines={1}>
          {invite.game.name} · vs {inviterName}
        </Text>
      </View>
      {error ? (
        <Text color="accent" style={styles.notice} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={[styles.board, { borderColor: colors.line }]}>
        <WordHuntBoard
          matchId={`guest:${token}`}
          view={view}
          players={players}
          myId={session.guestId}
          busy={busy}
          onMove={onMove}
        />
      </View>
    </SafeAreaView>
  );
}

/** Game over (design: WebGameEnd): the score, and "Get Dyce, keep the score". */
function GuestEnd({
  token,
  invite,
  view,
  guestId,
}: {
  token: string;
  invite: InvitePublic;
  view: WordHuntView;
  guestId: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const name = invite.inviter.displayName || invite.inviter.username;
  const score = view.scores[guestId] ?? 0;
  const words = view.words[guestId] ?? [];
  return (
    <InviteFrame>
      <View
        style={[styles.endCard, { backgroundColor: colors.card }]}
        accessibilityLabel="Game over"
      >
        <Text variant="caption" color="accent" accessibilityLiveRegion="polite">
          YOU SCORED {score}
        </Text>
        <Text variant="title" accessibilityRole="header" style={styles.center}>
          {words.length > 0 ? 'Not bad for a first round' : 'Next round will be better'}
        </Text>
        <Text color="sub" style={styles.center}>
          {name} plays the same grid next. Get Dyce to keep your score on your record and claim the
          Ð200k everyone starts with.
        </Text>
        <View style={styles.stats}>
          <Stat value={String(score)} label={score === 1 ? 'point' : 'points'} />
          <Stat value={String(words.length)} label={words.length === 1 ? 'word' : 'words'} />
          <Stat value="Ð200k" label="waiting" />
        </View>
        {words.length > 0 ? <WordChips words={words} muted /> : null}
        <Text variant="footnote" color="sub" style={styles.center}>
          {guestSummary(words.length, score)}
          {view.possibleWords ? ` · ${view.possibleWords} words were on the grid` : ''}
        </Text>
      </View>
      <View style={styles.spacer} />
      <StoreButtons
        primary
        joinLabel="Get Dyce, keep the score"
        onJoin={() => router.push(`/i/${token}/join` as Href)}
      />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Back to the invite"
        onPress={() => router.replace(`/i/${token}` as Href)}
        style={styles.back}
      >
        <Text variant="callout" color="accent">
          Back to the invite
        </Text>
      </Pressable>
    </InviteFrame>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.stat, { backgroundColor: colors.bg2 }]}
      accessible
      accessibilityLabel={`${value} ${label}`}
    >
      <Text variant="headline">{value}</Text>
      <Text variant="footnote" color="sub">
        {label}
      </Text>
    </View>
  );
}

function synthetic(
  userId: string,
  displayName: string,
  username: string,
  avatar: MatchPlayer['avatar'],
  seat: number,
  accepted: boolean,
): MatchPlayer {
  return {
    userId,
    username,
    displayName,
    avatar,
    seat,
    accepted,
    result: null,
    placement: null,
    stakedKobo: 0,
    payoutKobo: null,
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 20,
    minHeight: 52,
  },
  notice: { width: '100%', maxWidth: 480, paddingHorizontal: 20, paddingBottom: 6 },
  board: { flex: 1, width: '100%', maxWidth: 480 },
  errorBox: { gap: 10, paddingVertical: 16 },
  endCard: {
    borderRadius: 30,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 12,
    boxShadow: '0px 12px 40px rgba(90,30,10,0.10)',
  },
  stats: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  stat: { flex: 1, borderRadius: 16, paddingVertical: 10, alignItems: 'center' },
  spacer: { flexGrow: 1, minHeight: 4 },
  back: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
