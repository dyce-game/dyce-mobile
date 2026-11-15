import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira } from '@dyce/shared';
import { Icon, Text, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { useClaimTopup, useWalletQuery } from '@/features/wallet/use-wallet';
import { opponentOf } from '../games-logic';
import { counterChoices, counterLabel, resetsIn, type PoolIssueKind } from '../pool-logic';
import {
  useAcceptMatch,
  useCounterMatch,
  useDeclineMatch,
  useMatchQuery,
  usePoolInfoQuery,
} from '../use-games';
import { PoolIssuePanel, type PoolIssueOption } from '../components/PoolIssuePanel';

/**
 * Why you can't match a Pool invite right now (design: PoolIssues, PoolLimit): not enough Dyce Cash, or today's
 * Pool limit, with the ways forward the invite allows: claim the daily top-up, offer a smaller stake, play it
 * free, or leave it for later (it stays open until it expires). Nothing leaves your wallet until you match.
 */
export function PoolIssueScreen({ matchId, kind }: { matchId: string; kind: PoolIssueKind }) {
  const router = useRouter();
  const { colors } = useTheme();
  const myId = useSession((s) => s.userId);
  const match = useMatchQuery(matchId).data;
  const wallet = useWalletQuery();
  const info = usePoolInfoQuery();
  const topup = useClaimTopup();
  const counter = useCounterMatch();
  const accept = useAcceptMatch();
  const decline = useDeclineMatch();

  const chat = () =>
    router.replace((match?.conversationId ? `/c/${match.conversationId}` : '/chat') as Href);
  const back = () => (router.canGoBack() ? router.back() : chat());

  const them = match ? opponentOf(match, myId) : null;
  const who = them?.displayName || them?.username || 'Your friend';
  const stake = match?.stakeKobo ?? 0;
  const balance = wallet.data?.balanceKobo ?? 0;
  const canCounter = !!match?.allowCounter && match.status === 'invited';
  const smaller = counterChoices(stake, info.data?.minStakeKobo).find((c) => c > 0 && c <= balance);

  const offer = (kobo: number) =>
    counter.mutate({ id: matchId, stakeKobo: kobo }, { onSuccess: chat });

  const options: PoolIssueOption[] = [];
  if (kind === 'low-balance') {
    const canMatchNow = balance >= stake && stake > 0;
    if (canMatchNow) {
      options.push({
        title: `Match ${formatNaira(stake)} now`,
        sub: `Play for ${formatNaira(match?.potKobo ?? 0)}`,
        tone: 'primary',
        busy: accept.isPending,
        onPress: () =>
          accept.mutate(matchId, { onSuccess: () => router.replace(`/g/${matchId}` as Href) }),
      });
    } else if (wallet.data?.topup.available && !topup.isSuccess) {
      options.push({
        title: 'Claim daily top-up',
        sub: `+${formatNaira(wallet.data.topup.amountKobo)} now`,
        tone: 'primary',
        busy: topup.isPending,
        onPress: () => topup.mutate(),
      });
    }
    if (canCounter && smaller !== undefined && !canMatchNow) {
      options.push({
        title: `Counter at ${counterLabel(smaller)}`,
        sub: `${who} gets your offer as a message`,
        tone: 'quiet',
        busy: counter.isPending,
        onPress: () => offer(smaller),
      });
    }
  }
  if (canCounter) {
    options.push({
      title: 'Play this one free',
      sub: 'No cash moves, still earns XP',
      tone: 'free',
      busy: counter.isPending,
      onPress: () => offer(0),
    });
  }
  if (kind === 'limit') {
    options.push({
      title: 'Save it for tomorrow',
      sub: `${who}'s invite stays open until it expires`,
      tone: 'quiet',
      onPress: chat,
    });
  }
  options.push({
    title: 'Decline',
    sub: `${formatNaira(stake)} goes back to ${who}`,
    tone: 'quiet',
    busy: decline.isPending,
    onPress: () => decline.mutate(matchId, { onSuccess: chat }),
  });

  const error = counter.error ?? accept.error ?? decline.error ?? topup.error;
  const d = info.data;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={back}
          style={styles.close}
        >
          <Icon name="back" color={colors.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {kind === 'low-balance' ? (
          <PoolIssuePanel
            glyph="₦"
            title="Not enough Dyce Cash"
            sub={`${who}'s pool needs ${formatNaira(stake)} from you`}
            left={{ label: 'Your balance', value: formatNaira(balance) }}
            right={{ label: 'Needed', value: formatNaira(stake) }}
            fill={stake ? balance / stake : 0}
            options={options}
            foot="Dyce Cash can’t be bought. It only comes from wins, friends and the daily top-up."
          />
        ) : (
          <PoolIssuePanel
            glyph="!"
            title="Daily pool limit reached"
            sub={
              d
                ? `You can stake ${formatNaira(d.dailyStakeLimitKobo)} a day. Resets at midnight.`
                : 'Resets at midnight.'
            }
            left={{ label: 'Staked today', value: formatNaira(d?.stakedTodayKobo ?? 0) }}
            right={{ label: 'Resets in', value: resetsIn(d?.resetsInSeconds ?? 0) }}
            fill={d && d.dailyStakeLimitKobo ? d.stakedTodayKobo / d.dailyStakeLimitKobo : 1}
            options={options}
            foot="Pool limits keep play fun. They reset every day at midnight."
          />
        )}
        {error ? (
          <Text
            variant="footnote"
            color="accent"
            style={styles.center}
            accessibilityLiveRegion="polite"
          >
            {authErrorMessage(error)}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { padding: 8 },
  close: { width: 56, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  body: { padding: 20, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  center: { textAlign: 'center' },
});
