import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { formatNaira, type Message } from '@dyce/shared';
import { ModeBadge, Text, useTheme } from '@dyce/ui';
import { PillButton } from '@/components/PillButton';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { useConversationQuery } from '@/features/chat/use-chat';
import { cardLabel, cardState } from '../games-logic';
import { counterChoices, counterLabel, poolIssueOf, potLine } from '../pool-logic';
import {
  useAcceptMatch,
  useCancelMatch,
  useCounterMatch,
  useDeclineMatch,
  useMatchQuery,
} from '../use-games';
import { gameEntry, rulesFor } from '../registry';
import { GameArt } from './GameArt';

type GameMessage = Extract<Message, { kind: 'game' }>;

/**
 * A game in a conversation (design: Thread): art, the mode badge, what is happening ("Your turn", "Waiting
 * for Amaka", "You won") and the button for it. An invite can be answered right here; everything else opens
 * the game. It updates live as the match moves (the server rewrites the card for both players).
 */
export function GameCard({ message }: { message: GameMessage }) {
  const { colors } = useTheme();
  const router = useRouter();
  const myId = useSession((s) => s.userId);
  const peer = useConversationQuery(message.conversationId).data?.peer;
  const who = peer?.displayName || peer?.username || 'them';
  const { payload: sent } = message;
  // A game where both play at once (Word Hunt) has no turns: whose move it is depends on your own view, which
  // its registry entry reads (`mover`).
  const entry = gameEntry(sent.gameSlug);
  const simultaneous = !!entry?.mover && sent.status === 'active';
  const live = useMatchQuery(sent.matchId, simultaneous).data;
  const parsed = simultaneous && entry?.parseView ? entry.parseView(live?.view) : null;
  const payload =
    parsed !== null && entry?.mover ? { ...sent, currentTurn: entry.mover(parsed, myId) } : sent;
  const state = cardState(payload, message.senderId, myId, who);
  const accept = useAcceptMatch();
  const decline = useDeclineMatch();
  const cancel = useCancelMatch();
  const counter = useCounterMatch();
  const [countering, setCountering] = useState(false);
  const busy = accept.isPending || decline.isPending || cancel.isPending || counter.isPending;
  const error = accept.error ?? decline.error ?? cancel.error ?? counter.error;
  const pot = potLine(payload);
  const stake = formatNaira(payload.stakeKobo ?? 0);

  // Accepting a Pool invite can run into "not enough Dyce Cash" or today's limit: say why, with ways forward.
  const acceptInvite = () =>
    accept.mutate(payload.matchId, {
      onSuccess: () => router.push(`/g/${payload.matchId}` as Href),
      onError: (err) => {
        const kind = err instanceof ApiError ? poolIssueOf(err.code) : null;
        if (kind) router.push(`/games/issue?matchId=${payload.matchId}&kind=${kind}` as Href);
      },
    });

  const open = () =>
    router.push(
      (state.cta === 'results' ? `/g/${payload.matchId}/result` : `/g/${payload.matchId}`) as Href,
    );
  const ctaLabel = { play: 'Play', watch: 'View', results: 'Results' } as const;
  const openable = state.cta !== null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Pressable
        accessibilityRole={openable ? 'button' : 'text'}
        accessibilityLabel={cardLabel(payload, state)}
        accessibilityHint={openable ? 'Opens the game' : undefined}
        disabled={!openable}
        onPress={open}
      >
        <GameArt slug={payload.gameSlug} compact style={styles.art} />
        <View style={styles.badges}>
          <ModeBadge kind={payload.mode === 'pool' ? 'POOL' : 'FREE'} />
          {state.yourTurn ? <ModeBadge kind="YOUR TURN" /> : null}
        </View>
        <View style={styles.body}>
          <Text variant="headline" numberOfLines={1}>
            {payload.variantLabel
              ? `${payload.gameName} · ${payload.variantLabel}`
              : payload.gameName}
          </Text>
          <Text
            variant="footnote"
            color={state.yourTurn ? 'accent' : 'sub'}
            accessibilityLiveRegion="polite"
          >
            {state.text}
          </Text>
          {pot ? (
            <Text variant="footnote" color="sub">
              {pot}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.actions}>
        {state.cta ? (
          <PillButton
            label={ctaLabel[state.cta]}
            tone={state.cta === 'play' ? 'primary' : 'neutral'}
            accessibilityLabel={`${ctaLabel[state.cta]} ${payload.gameName}`}
            onPress={open}
          />
        ) : null}
        {state.invite === 'answer' && !countering ? (
          <>
            <PillButton
              label={payload.mode === 'pool' ? `Match ${stake}` : 'Accept'}
              tone="primary"
              busy={busy}
              accessibilityLabel={
                payload.mode === 'pool'
                  ? `Match the ${stake} stake and play ${payload.gameName} with ${who}`
                  : `Accept ${payload.gameName} from ${who}`
              }
              onPress={acceptInvite}
            />
            {payload.mode === 'pool' && payload.allowCounter ? (
              <PillButton
                label="Counter"
                busy={busy}
                accessibilityLabel={`Suggest a different stake to ${who}`}
                onPress={() => setCountering(true)}
              />
            ) : null}
            <PillButton
              label="Decline"
              busy={busy}
              accessibilityLabel={`Decline ${payload.gameName} from ${who}`}
              onPress={() => decline.mutate(payload.matchId)}
            />
          </>
        ) : null}
        {state.invite === 'answer' && countering ? (
          <>
            <View style={styles.counterNote}>
              <Text variant="footnote" color="sub">
                Suggest a stake each. {who} gets your offer on the card.
              </Text>
            </View>
            {counterChoices(
              payload.stakeKobo ?? 0,
              rulesFor(payload.gameSlug)?.poolMinKobo ?? undefined,
            ).map((c) => (
              <PillButton
                key={c}
                label={counterLabel(c)}
                tone={c === 0 ? 'neutral' : 'primary'}
                busy={busy}
                accessibilityLabel={
                  c === 0 ? `Ask ${who} to play this one free` : `Offer ${formatNaira(c)} each`
                }
                onPress={() =>
                  counter.mutate(
                    { id: payload.matchId, stakeKobo: c },
                    { onSuccess: () => setCountering(false) },
                  )
                }
              />
            ))}
            <PillButton label="Back" busy={busy} onPress={() => setCountering(false)} />
          </>
        ) : null}
        {state.invite === 'counter-answer' ? (
          <>
            <PillButton
              label={
                (payload.counterStakeKobo ?? 0) === 0
                  ? 'Play free'
                  : `Accept ${formatNaira(payload.counterStakeKobo ?? 0)}`
              }
              tone="primary"
              busy={busy}
              accessibilityLabel={
                (payload.counterStakeKobo ?? 0) === 0
                  ? `Play ${payload.gameName} free with ${who}. Your ${stake} comes back.`
                  : `Accept ${who}'s offer of ${formatNaira(payload.counterStakeKobo ?? 0)} each. The rest of your stake comes back.`
              }
              onPress={() =>
                accept.mutate(payload.matchId, {
                  onSuccess: () => router.push(`/g/${payload.matchId}` as Href),
                })
              }
            />
            <PillButton
              label="Decline"
              busy={busy}
              accessibilityLabel={`Decline ${who}'s offer. Your ${stake} comes back.`}
              onPress={() => decline.mutate(payload.matchId)}
            />
          </>
        ) : null}
        {state.invite === 'counter-wait' ? (
          <PillButton
            label="Withdraw"
            busy={busy}
            accessibilityLabel="Withdraw your offer"
            onPress={() => decline.mutate(payload.matchId)}
          />
        ) : null}
        {state.invite === 'wait' ? (
          <PillButton
            label="Cancel"
            busy={busy}
            accessibilityLabel={`Cancel ${payload.gameName} invite`}
            onPress={() => cancel.mutate(payload.matchId)}
          />
        ) : null}
      </View>
      {error ? (
        <Text
          variant="footnote"
          color="accent"
          style={styles.error}
          accessibilityLiveRegion="polite"
        >
          {authErrorMessage(error)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 250, borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  art: { height: 84 },
  badges: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 6 },
  body: { paddingHorizontal: 14, paddingTop: 10, gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, paddingTop: 10 },
  error: { paddingHorizontal: 14, paddingBottom: 12 },
  counterNote: { width: '100%' },
});
