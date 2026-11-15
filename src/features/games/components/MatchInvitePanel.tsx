import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { formatNaira, type MatchView } from '@dyce/shared';
import { Text, TokenButton } from '@dyce/ui';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { counterChoices, counterLabel, expiresIn, poolIssueOf } from '../pool-logic';
import { useAcceptMatch, useCancelMatch, useCounterMatch, useDeclineMatch } from '../use-games';

/**
 * An invite that has not started, inside the game host: a plain invite (Free or Pool) or, in Pool, the
 * invitee's counter-offer waiting for the sender. Mirrors the card in the chat: Match / Counter / Decline for the
 * invitee, Accept or Decline an offer for the sender, Cancel or Withdraw while waiting.
 */
export function MatchInvitePanel({
  match,
  myId,
  oppName,
}: {
  match: MatchView;
  myId: string | null;
  oppName: string;
}) {
  const router = useRouter();
  const accept = useAcceptMatch();
  const decline = useDeclineMatch();
  const cancel = useCancelMatch();
  const counter = useCounterMatch();
  const [countering, setCountering] = useState(false);
  const mine = match.createdBy === myId;
  const pool = match.mode === 'pool';
  const busy = accept.isPending || decline.isPending || cancel.isPending || counter.isPending;
  const err = accept.error ?? decline.error ?? cancel.error ?? counter.error;
  const stake = formatNaira(match.stakeKobo);
  const pot = formatNaira(match.potKobo);
  const offer = match.counterStakeKobo;
  const left = expiresIn(match.inviteExpiresAt);

  const acceptInvite = () =>
    accept.mutate(match.id, {
      onError: (e) => {
        const kind = e instanceof ApiError ? poolIssueOf(e.code) : null;
        if (kind) router.push(`/games/issue?matchId=${match.id}&kind=${kind}` as Href);
      },
    });

  let title: string;
  let sub: string;
  if (match.status === 'countered') {
    const offerText = offer === 0 ? 'to play this one free' : `${formatNaira(offer ?? 0)} each`;
    title = mine ? `${oppName} offered ${offerText}` : `You offered ${offerText}`;
    sub = mine
      ? offer === 0
        ? `Accept and your ${stake} comes back right away. Nothing is played for cash.`
        : `Your ${stake} is still locked. Accepting returns ${formatNaira(match.stakeKobo - (offer ?? 0))} to you right away.`
      : `Waiting for ${oppName}. Nothing has left your wallet.`;
  } else if (mine) {
    title = `Waiting for ${oppName}`;
    sub = pool
      ? `Your ${stake} is locked. If ${oppName} says no or doesn't answer, it goes back to you.`
      : 'You can start as soon as they accept.';
  } else {
    title = `${oppName} wants to play ${match.gameName}`;
    sub = pool
      ? `${oppName} locked ${stake}. Match it and you play for ${pot}. Nothing leaves your wallet until you match.`
      : 'Free play: no cash moves. The first turn is theirs.';
  }

  return (
    <View style={styles.center}>
      <Text variant="headline" style={styles.text} accessibilityRole="header">
        {title}
      </Text>
      <Text color="sub" style={styles.text}>
        {sub}
      </Text>
      {pool && left ? (
        <Text variant="footnote" color="sub" style={styles.text}>
          {`Expires in ${left}`}
        </Text>
      ) : null}

      {match.status === 'invited' && !mine && !countering ? (
        <View style={styles.col}>
          <TokenButton
            label={pool ? `Match ${stake}` : 'Accept'}
            tone={pool ? 'ember' : 'felt'}
            disabled={busy}
            accessibilityLabel={
              pool
                ? `Match the ${stake} stake and play ${match.gameName} with ${oppName}`
                : `Accept ${match.gameName} from ${oppName}`
            }
            onPress={acceptInvite}
          />
          {pool && match.allowCounter ? (
            <TokenButton
              label="Counter"
              tone="chip"
              disabled={busy}
              accessibilityLabel={`Suggest a different stake to ${oppName}`}
              onPress={() => setCountering(true)}
            />
          ) : null}
          <TokenButton
            label="Decline"
            tone="chip"
            disabled={busy}
            accessibilityLabel={`Decline ${match.gameName} from ${oppName}`}
            onPress={() => decline.mutate(match.id)}
          />
        </View>
      ) : null}

      {match.status === 'invited' && !mine && countering ? (
        <View style={styles.col}>
          <Text variant="footnote" color="sub" style={styles.text}>
            Suggest a stake each. {oppName} gets your offer as a message.
          </Text>
          {counterChoices(match.stakeKobo).map((c) => (
            <TokenButton
              key={c}
              label={counterLabel(c)}
              tone={c === 0 ? 'felt' : 'chip'}
              disabled={busy}
              accessibilityLabel={
                c === 0 ? `Ask ${oppName} to play this one free` : `Offer ${formatNaira(c)} each`
              }
              onPress={() =>
                counter.mutate(
                  { id: match.id, stakeKobo: c },
                  { onSuccess: () => setCountering(false) },
                )
              }
            />
          ))}
          <TokenButton label="Back" tone="chip" onPress={() => setCountering(false)} />
        </View>
      ) : null}

      {match.status === 'countered' && mine ? (
        <View style={styles.col}>
          <TokenButton
            label={offer === 0 ? 'Play free' : `Accept ${formatNaira(offer ?? 0)}`}
            tone="ember"
            disabled={busy}
            onPress={() => accept.mutate(match.id)}
          />
          <TokenButton
            label="Decline"
            tone="chip"
            disabled={busy}
            accessibilityLabel={`Decline ${oppName}'s offer. Your ${stake} comes back.`}
            onPress={() => decline.mutate(match.id)}
          />
        </View>
      ) : null}

      {match.status === 'countered' && !mine ? (
        <TokenButton
          label="Withdraw offer"
          tone="chip"
          disabled={busy}
          onPress={() => decline.mutate(match.id)}
        />
      ) : null}

      {match.status === 'invited' && mine ? (
        <TokenButton
          label="Cancel invite"
          tone="chip"
          disabled={busy}
          onPress={() => cancel.mutate(match.id)}
        />
      ) : null}

      {err ? (
        <Text
          variant="footnote"
          color="accent"
          style={styles.text}
          accessibilityLiveRegion="polite"
        >
          {authErrorMessage(err)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  text: { textAlign: 'center' },
  col: { gap: 10, alignSelf: 'stretch', maxWidth: 360, width: '100%' },
});
