import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import type { Message } from '@dyce/shared';
import { ModeBadge, Text, useTheme } from '@dyce/ui';
import { PillButton } from '@/components/PillButton';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { useConversationQuery } from '@/features/chat/use-chat';
import { cardLabel, cardState } from '../games-logic';
import { useAcceptMatch, useCancelMatch, useDeclineMatch } from '../use-games';
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
  const { payload } = message;
  const state = cardState(payload, message.senderId, myId, who);
  const accept = useAcceptMatch();
  const decline = useDeclineMatch();
  const cancel = useCancelMatch();
  const busy = accept.isPending || decline.isPending || cancel.isPending;
  const error = accept.error ?? decline.error ?? cancel.error;

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
            {payload.gameName}
          </Text>
          <Text
            variant="footnote"
            color={state.yourTurn ? 'accent' : 'sub'}
            accessibilityLiveRegion="polite"
          >
            {state.text}
          </Text>
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
        {state.invite === 'answer' ? (
          <>
            <PillButton
              label="Accept"
              tone="primary"
              busy={busy}
              accessibilityLabel={`Accept ${payload.gameName} from ${who}`}
              onPress={() =>
                accept.mutate(payload.matchId, {
                  onSuccess: () => router.push(`/g/${payload.matchId}` as Href),
                })
              }
            />
            <PillButton
              label="Decline"
              busy={busy}
              accessibilityLabel={`Decline ${payload.gameName} from ${who}`}
              onPress={() => decline.mutate(payload.matchId)}
            />
          </>
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
});
