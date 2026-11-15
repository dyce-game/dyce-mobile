import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, ModeBadge, Text, TokenButton, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { WordHuntBoard } from '../boards/WordHuntBoard';
import { MatchInvitePanel } from '../components/MatchInvitePanel';
import { PigBoard } from '../components/PigBoard';
import { opponentOf, parsePigView, parseWordHuntView } from '../games-logic';
import { useMatchQuery, useSubmitMove } from '../use-games';

/**
 * The game host (route g/[matchId]): the shared shell around a game: back to the chat, the mode badge, the
 * opponent, and then either the invite (accept / decline), the game itself, or what became of it. When the
 * match finishes it moves on to the results screen. Pig is the only game so far; each new game adds its own
 * board here.
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

  // A finished match shows its result.
  useEffect(() => {
    if (match?.status === 'finished') router.replace(`/g/${matchId}/result` as Href);
  }, [match?.status, matchId, router]);

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
          {match?.gameName ?? 'Game'}
        </Text>
        {match ? <ModeBadge kind={match.mode === 'pool' ? 'POOL' : 'FREE'} /> : null}
      </View>
      <View style={styles.side}>
        {opponent ? (
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
  } else {
    const pig = match.gameSlug === '_example' ? parsePigView(match.view) : null;
    const wordHunt = match.gameSlug === 'word-hunt' ? parseWordHuntView(match.view) : null;
    body = wordHunt ? (
      <View style={styles.flex}>
        <WordHuntBoard
          matchId={match.id}
          view={wordHunt}
          players={match.players}
          myId={myId}
          busy={move.isPending}
          onMove={(action) => move.mutate({ expectedVersion: match.stateVersion, action })}
        />
        {move.isError ? (
          <Text
            variant="footnote"
            color="accent"
            accessibilityLiveRegion="polite"
            style={styles.text}
          >
            {authErrorMessage(move.error)}
          </Text>
        ) : null}
      </View>
    ) : pig ? (
      <ScrollView contentContainerStyle={styles.scroll}>
        <PigBoard
          view={pig}
          players={match.players}
          myId={myId}
          yourTurn={match.status === 'active' && match.currentTurn === myId}
          busy={move.isPending}
          onMove={(kind) => move.mutate({ expectedVersion: match.stateVersion, action: { kind } })}
        />
        {move.isError ? (
          <Text
            variant="footnote"
            color="accent"
            accessibilityLiveRegion="polite"
            style={styles.text}
          >
            {authErrorMessage(move.error)}
          </Text>
        ) : null}
      </ScrollView>
    ) : (
      <Centered>
        <Text variant="headline" style={styles.text}>
          Update Dyce to play this game
        </Text>
        <TokenButton label="Back to chat" onPress={goBack} />
      </Centered>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      {header}
      {body}
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
  title: { alignItems: 'center', gap: 4, flex: 1 },
  scroll: { padding: 16, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  text: { textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12 },
});
