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
import { useDisputeQuery } from '@/features/account/use-account';
import { StreakPrompt } from '@/features/progress/StreakPrompt';
import { useWalletQuery } from '@/features/wallet/use-wallet';
import { PoolResultPanel } from '../components/PoolResultPanel';
import { opponentOf, resultCopy } from '../games-logic';
import { poolResult } from '../pool-logic';
import { gameEntry } from '../registry';
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
  const disputeInfo = useDisputeQuery(
    matchId,
    match?.status === 'finished' && match.mode === 'pool',
  ).data;

  // Pop back to the thread this game was started from (not a second copy of it on top), so Back from the thread
  // lands on the chat list or wherever the person came from: BUG-2.
  const chat = () =>
    router.dismissTo((match?.conversationId ? `/c/${match.conversationId}` : '/chat') as Href);

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
  // What is specific to the game (its score line, its picture, extra detail) comes from its registry entry.
  const entry = gameEntry(match.gameSlug);
  const view = entry?.parseView ? entry.parseView(match.view) : null;
  const Art = entry?.Art;
  const Extras = entry?.ResultExtras;
  const copy = resultCopy(
    match,
    myId,
    oppName,
    view !== null && entry?.scoreLine ? entry.scoreLine(view, myId, nameOf) : null,
  );
  const finished = match.status === 'finished';
  const pool = finished ? poolResult(match, myId, oppName, wallet.data?.balanceKobo ?? null) : null;
  // A Pool result can be disputed for a day (SPEC section 9); once you have, the link shows its status instead.
  const disputeLink = disputeInfo?.dispute
    ? 'See your dispute'
    : disputeInfo?.canDispute
      ? 'Dispute this result'
      : null;
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
        // a Mancala game is rematched as Mancala
        ...(match.options && Object.keys(match.options).length > 0
          ? { options: match.options }
          : {}),
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
      {/* If a streak has just ended and can be saved, say so once (design: StreakLost) */}
      <StreakPrompt enabled={finished && match.mode === 'free'} />
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
        ) : Art ? (
          <Art hero />
        ) : (
          <View style={styles.fallbackArt} aria-hidden />
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
        {finished && Extras && view !== null ? (
          <Extras view={view} myId={myId} nameOf={nameOf} />
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
        {pool && disputeLink ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={disputeLink}
            onPress={() => router.push(`/dispute/${matchId}` as Href)}
            style={styles.disputeLink}
          >
            <Text variant="callout" color="accent">
              {disputeLink}
            </Text>
          </Pressable>
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
  disputeLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  kicker: { alignItems: 'center', gap: 4 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  fallbackArt: { width: 150, height: 120, borderRadius: 22, backgroundColor: brand.felt.fill },
  center: { textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  actions: { gap: 12, padding: 20, maxWidth: 520, width: '100%', alignSelf: 'center' },
});
