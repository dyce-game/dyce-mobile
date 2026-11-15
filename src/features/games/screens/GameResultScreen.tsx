import { useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira } from '@dyce/shared';
import { Icon, ModeBadge, Text, TokenButton, brand, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { newMessageId } from '@/features/chat/chat-logic';
import { useWalletQuery } from '@/features/wallet/use-wallet';
import { WordHuntResultWords } from '../boards/WordHuntResultWords';
import { WordHuntArt } from '../boards/WordHuntArt';
import { DieFace } from '../components/DieFace';
import { PoolResultPanel } from '../components/PoolResultPanel';
import {
  opponentOf,
  parsePigView,
  parseWordHuntView,
  resultCopy,
  scoreLine,
  wordHuntScoreLine,
} from '../games-logic';
import { poolResult } from '../pool-logic';
import { useCreateMatch, useMatchQuery } from '../use-games';

/**
 * The result of a finished Free game (design: FreeResult): who won, the final score, a rematch and back to
 * the chat. Both players read the same outcome from the server. XP, streaks, badges and the friends
 * leaderboard from the design arrive with the progression work.
 */
export function GameResultScreen({ matchId }: { matchId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const myId = useSession((s) => s.userId);
  const query = useMatchQuery(matchId);
  const rematch = useCreateMatch();
  const wallet = useWalletQuery();
  const rematchId = useRef<string | null>(null);
  const match = query.data;

  const chat = () =>
    router.replace((match?.conversationId ? `/c/${match.conversationId}` : '/chat') as Href);

  if (!match) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.loading}>
          {query.isError ? (
            <>
              <Text color="accent">{authErrorMessage(query.error)}</Text>
              <TokenButton label="Back to chat" onPress={chat} />
            </>
          ) : (
            <ActivityIndicator color={colors.sub} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const opponent = opponentOf(match, myId);
  const oppName = opponent?.displayName || opponent?.username || 'Your friend';
  const me = match.players.find((p) => p.userId === myId) ?? null;
  const nameOf = (id: string) => {
    const p = match.players.find((x) => x.userId === id);
    return p?.displayName || p?.username || 'Them';
  };
  const pig = match.gameSlug === '_example' ? parsePigView(match.view) : null;
  const wordHunt = match.gameSlug === 'word-hunt' ? parseWordHuntView(match.view) : null;
  const copy = resultCopy(
    match,
    myId,
    oppName,
    pig
      ? scoreLine(pig, myId, nameOf)
      : wordHunt
        ? wordHuntScoreLine(wordHunt, myId, nameOf)
        : null,
  );
  const finished = match.status === 'finished';
  const pool = finished ? poolResult(match, myId, oppName, wallet.data?.balanceKobo ?? null) : null;
  const poolTitle = pool
    ? pool.outcome === 'won'
      ? 'You won the pool'
      : pool.outcome === 'lost'
        ? `${oppName} took the pool`
        : 'Dead even'
    : null;
  const hero = copy.tone === 'won' ? me : copy.tone === 'lost' ? opponent : null;

  function playAgain(mode: 'free' | 'pool' = 'free') {
    if (!match?.conversationId) return;
    rematchId.current ??= newMessageId();
    rematch.mutate(
      {
        id: rematchId.current,
        conversationId: match.conversationId,
        gameSlug: match.gameSlug,
        mode,
        stakeKobo: mode === 'pool' ? match.stakeKobo : 0,
      },
      {
        onSuccess: () => {
          rematchId.current = null;
          chat();
        },
      },
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={chat}
          style={styles.close}
        >
          <Icon name="back" color={colors.text} />
        </Pressable>
        <View style={styles.kicker}>
          <Text variant="caption" color="sub">
            {match.gameName.toUpperCase()}
          </Text>
          <ModeBadge kind={match.mode === 'pool' ? 'POOL' : 'FREE'} />
        </View>
        <View style={styles.close} />
      </View>

      <View style={styles.hero} accessibilityLiveRegion="polite">
        {hero ? (
          <UserAvatar avatar={hero.avatar} name={hero.displayName || hero.username} size={96} />
        ) : wordHunt ? (
          <WordHuntArt size={50} style={styles.wordArt} />
        ) : (
          <View style={styles.dice} aria-hidden>
            <DieFace value={4} size={60} rotate={-10} />
            <DieFace value={4} size={60} rotate={10} />
          </View>
        )}
        <Text variant="title" accessibilityRole="header" style={styles.center}>
          {finished ? (poolTitle ?? copy.title) : 'Still playing'}
        </Text>
        {finished && copy.detail ? (
          <Text
            color="sub"
            style={styles.center}
            accessibilityLabel={`Final score: ${copy.detail}`}
          >
            {copy.detail}
          </Text>
        ) : null}
        {pool ? <PoolResultPanel result={pool} /> : null}
        {finished && wordHunt ? (
          <WordHuntResultWords view={wordHunt} myId={myId} nameOf={nameOf} />
        ) : null}
      </View>

      <View style={styles.actions}>
        {finished ? (
          <>
            {pool ? (
              <TokenButton
                label={
                  rematch.isPending ? 'Sending…' : `Rematch · ${formatNaira(match.stakeKobo)} each`
                }
                accessibilityLabel={`Send ${oppName} a pool rematch, ${formatNaira(match.stakeKobo)} each`}
                tone="ember"
                disabled={rematch.isPending || !match.conversationId}
                onPress={() => playAgain('pool')}
              />
            ) : null}
            <TokenButton
              label={rematch.isPending ? 'Sending…' : 'Rematch free'}
              accessibilityLabel={`Send ${oppName} a rematch, free play`}
              tone={pool ? 'chip' : 'felt'}
              disabled={rematch.isPending || !match.conversationId}
              onPress={() => playAgain('free')}
            />
          </>
        ) : (
          <TokenButton
            label="Back to the game"
            onPress={() => router.replace(`/g/${matchId}` as Href)}
          />
        )}
        <TokenButton label="Back to chat" tone="chip" onPress={chat} />
        {rematch.isError ? (
          <Text
            variant="footnote"
            color="accent"
            accessibilityLiveRegion="polite"
            style={styles.center}
          >
            {authErrorMessage(rematch.error)}
          </Text>
        ) : null}
        <Text variant="footnote" color="sub" style={styles.center}>
          {match.mode === 'pool'
            ? 'Dyce Cash is virtual: it can’t be withdrawn or bought.'
            : 'Free play: nothing was won or lost in Dyce Cash.'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8 },
  close: { width: 56, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  kicker: { alignItems: 'center', gap: 4 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  dice: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: brand.felt.fill,
    padding: 18,
    borderRadius: 22,
  },
  wordArt: { width: 150, height: 120, borderRadius: 22 },
  center: { textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  actions: { gap: 12, padding: 20, maxWidth: 520, width: '100%', alignSelf: 'center' },
});
