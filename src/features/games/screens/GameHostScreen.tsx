import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, ModeBadge, Text, TokenButton, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { ComingSoonPanel } from '../components/ComingSoonPanel';
import { GameMenuSheet } from '../components/GameMenuSheet';
import { GameStateCard, OfflineGlyph } from '../components/GameStateCard';
import { MatchInvitePanel } from '../components/MatchInvitePanel';
import { isNetworkFailure, offlineCopy } from '../games-edge-logic';
import { opponentOf } from '../games-logic';
import { forfeitIn } from '../pool-logic';
import { gameEntry } from '../registry';
import { useMatchQuery, useSubmitMove } from '../use-games';

/**
 * The game host (route g/[matchId]): the shared shell around a game: back to the chat, the mode badge, the
 * opponent, and then either the invite (accept / decline), the game itself, or what became of it. When the
 * match finishes it moves on to the results screen. The board itself comes from the game's registry entry
 * (`registry/entries/<slug>.ts`), so nothing here changes when a game is added.
 */
export function GameHostScreen({ matchId }: { matchId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const myId = useSession((s) => s.userId);
  const query = useMatchQuery(matchId);
  const move = useSubmitMove(matchId);
  const match = query.data;

  const goBack = () =>
    router.canGoBack()
      ? router.back()
      : router.replace((match?.conversationId ? `/c/${match.conversationId}` : '/chat') as Href);

  // A finished match shows its result. A board that is still animating the last move (Cup Pong's final throw)
  // says so through the entry's `holdResult`, and calls `onSettled` when it is done.
  const [, settle] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const entry = match ? gameEntry(match.gameSlug) : null;
  const view = match && entry?.parseView ? entry.parseView(match.view) : null;
  const holdForThrow =
    match?.status === 'finished' &&
    !!entry?.holdResult &&
    view !== null &&
    entry.holdResult(matchId, view);
  useEffect(() => {
    if (match?.status === 'finished' && !holdForThrow) {
      router.replace(`/g/${matchId}/result` as Href);
    }
  }, [match?.status, holdForThrow, matchId, router]);

  const opponent = match ? opponentOf(match, myId) : null;
  const oppName = opponent?.displayName || opponent?.username || 'your friend';
  const missing = query.isError && query.error instanceof ApiError && query.error.status === 404;

  const header = (
    <View style={[styles.header, { borderColor: colors.line, backgroundColor: colors.bg }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to chat"
        onPress={goBack}
        style={styles.side}
      >
        <Icon name="back" color={colors.text} />
      </Pressable>
      <View style={styles.title}>
        <Text variant="callout" numberOfLines={1}>
          {match
            ? match.variantLabel
              ? `${match.gameName} · ${match.variantLabel}`
              : match.gameName
            : 'Game'}
        </Text>
        {match ? <ModeBadge kind={match.mode === 'pool' ? 'POOL' : 'FREE'} /> : null}
      </View>
      <View style={styles.side}>
        {match?.status === 'active' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Game menu"
            onPress={() => setMenuOpen(true)}
            style={styles.menuButton}
          >
            <Icon name="menu" color={colors.text} />
          </Pressable>
        ) : opponent ? (
          <View accessible accessibilityLabel={`Playing ${oppName}`}>
            <UserAvatar avatar={opponent.avatar} name={oppName} size={36} />
          </View>
        ) : null}
      </View>
    </View>
  );

  let body: React.ReactNode;
  if (missing) {
    body = (
      <Centered>
        <Text variant="headline">This game isn&apos;t there any more</Text>
        <TokenButton label="Back to chat" onPress={goBack} />
      </Centered>
    );
  } else if (query.isError && !match) {
    body = (
      <Centered>
        <Text color="accent">{authErrorMessage(query.error)}</Text>
        <TokenButton label="Try again" tone="chip" onPress={() => void query.refetch()} />
      </Centered>
    );
  } else if (!match) {
    body = (
      <Centered>
        <ActivityIndicator color={colors.sub} />
      </Centered>
    );
  } else if (match.status === 'invited' || match.status === 'countered') {
    body = <MatchInvitePanel match={match} myId={myId} oppName={oppName} />;
  } else if (match.status === 'cancelled' || match.status === 'expired') {
    body = (
      <Centered>
        <Text variant="headline">
          {match.status === 'expired' ? 'This invite expired' : 'This invite was cancelled'}
        </Text>
        <TokenButton label="Back to chat" onPress={goBack} />
      </Centered>
    );
  } else if (entry?.Board && view !== null) {
    const Board = entry.Board;
    const failed = move.isError ? (
      <Text variant="footnote" color="accent" accessibilityLiveRegion="polite" style={styles.text}>
        {authErrorMessage(move.error)}
      </Text>
    ) : null;
    const board = (
      <Board
        matchId={match.id}
        match={match}
        view={view}
        players={match.players}
        myId={myId}
        yourTurn={match.status === 'active' && match.currentTurn === myId}
        busy={move.isPending}
        moveFailed={move.isError}
        onMove={(action) => move.mutate({ expectedVersion: match.stateVersion, action })}
        onSettled={() => settle((n) => n + 1)}
      />
    );
    body = entry.scroll ? (
      <ScrollView contentContainerStyle={styles.scroll}>
        {board}
        {failed}
      </ScrollView>
    ) : (
      <View style={styles.flex}>
        {board}
        {failed}
      </View>
    );
  } else if (entry && !entry.Board) {
    body = <ComingSoonPanel slug={match.gameSlug} onBack={goBack} />;
  } else {
    body = (
      <Centered>
        <Text variant="headline" style={styles.text}>
          Update Dyce to play this game
        </Text>
        <TokenButton label="Back to chat" onPress={goBack} />
      </Centered>
    );
  }

  // The phone can't reach the server while a game is open (design: GameOffline). The game stays as it was; a move
  // that didn't send can be played again. There is no turn timer on async games yet, so nothing counts down.
  const offline = !!match && (isNetworkFailure(query.error) || isNetworkFailure(move.error));
  const retry = () => {
    move.reset();
    void query.refetch();
  };

  // Pool: a player who does not move in 24 hours forfeits (backend ADR-041), so say how long is left.
  const left = match?.status === 'active' ? forfeitIn(match.turnDeadlineAt) : null;
  const clockLine = left ? (
    <Text
      variant="footnote"
      color="sub"
      style={styles.clock}
      accessibilityLabel={`${match?.currentTurn === myId ? 'You forfeit' : `${oppName} forfeits`} in ${left} if nobody moves`}
    >
      {match?.currentTurn === myId ? 'You forfeit' : `${oppName} forfeits`} in {left} without a move
    </Text>
  ) : null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      {header}
      {clockLine}
      {body}
      {menuOpen && match ? (
        <GameMenuSheet
          match={match}
          myId={myId}
          oppName={oppName}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
      {offline && match ? (
        <GameStateCard
          tone="offline"
          center={<OfflineGlyph color="#0067D6" />}
          {...offlineCopy(match)}
          primary={{ label: query.isFetching ? 'Reconnecting…' : 'Retry now', onPress: retry }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  side: { minWidth: 56, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  menuButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  title: { alignItems: 'center', gap: 4, flex: 1 },
  scroll: { padding: 16, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  text: { textAlign: 'center' },
  clock: { textAlign: 'center', paddingVertical: 4 },
  row: { flexDirection: 'row', gap: 12 },
});
