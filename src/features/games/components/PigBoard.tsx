import { StyleSheet, View } from 'react-native';
import type { MatchPlayer } from '@dyce/shared';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { describeLastRoll, type PigView } from '../games-logic';
import { DieFace } from './DieFace';

function ScoreCard({
  player,
  score,
  target,
  mine,
  active,
}: {
  player: MatchPlayer;
  score: number;
  target: number;
  mine: boolean;
  active: boolean;
}) {
  const { colors } = useTheme();
  const name = mine ? 'You' : player.displayName || player.username;
  return (
    <View
      accessible
      accessibilityLabel={`${name}: ${score} of ${target}${active ? ', their turn' : ''}`}
      style={[
        styles.score,
        { backgroundColor: colors.card, borderColor: active ? colors.accent : colors.line },
      ]}
    >
      <UserAvatar avatar={player.avatar} name={player.displayName || player.username} size={44} />
      <Text variant="callout" numberOfLines={1}>
        {name}
      </Text>
      <Text variant="title">{score}</Text>
      <Text variant="footnote" color={active ? 'accent' : 'sub'}>
        {active ? 'Rolling' : `of ${target}`}
      </Text>
    </View>
  );
}

/**
 * Pig as a play surface: both scores, the running turn total, the last roll and the two buttons. It only
 * shows what the server's view says and sends moves; it decides nothing. Buttons are live only on your turn.
 */
export function PigBoard({
  view,
  players,
  myId,
  yourTurn,
  busy,
  onMove,
}: {
  view: PigView;
  players: MatchPlayer[];
  myId: string | null;
  yourTurn: boolean;
  busy: boolean;
  onMove: (kind: 'roll' | 'hold') => void;
}) {
  const { colors } = useTheme();
  const nameOf = (id: string) => {
    const p = players.find((x) => x.userId === id);
    return p?.displayName || p?.username || 'Them';
  };
  const turnId = view.players[view.turn] ?? null;
  const last = describeLastRoll(view, myId, nameOf);
  const turnName = turnId === myId ? 'Your' : `${nameOf(turnId ?? '')}'s`;

  return (
    <View style={styles.board}>
      <View style={styles.scores}>
        {view.players.map((id) => {
          const p = players.find((x) => x.userId === id);
          return p ? (
            <ScoreCard
              key={id}
              player={p}
              score={view.scores[id] ?? 0}
              target={view.target}
              mine={id === myId}
              active={id === turnId}
            />
          ) : null;
        })}
      </View>

      <View style={[styles.table, { backgroundColor: colors.bg2, borderColor: colors.line }]}>
        <Text variant="footnote" color="sub">
          {turnName} turn total
        </Text>
        <Text variant="display" accessibilityLabel={`Turn total ${view.turnPoints}`}>
          {view.turnPoints}
        </Text>
        <View style={styles.dieSlot}>
          {view.lastRoll ? <DieFace value={view.lastRoll} size={64} /> : null}
        </View>
        <Text variant="footnote" color="sub" accessibilityLiveRegion="polite" style={styles.center}>
          {last?.text ??
            `First to ${view.target} wins. Roll to add to your turn total; a 1 loses it.`}
        </Text>
      </View>

      <Text
        variant="callout"
        color={yourTurn ? 'accent' : 'sub'}
        accessibilityLiveRegion="polite"
        style={styles.center}
      >
        {yourTurn ? 'Your turn' : `Waiting for ${nameOf(turnId ?? '')}`}
      </Text>

      <View style={styles.actions}>
        <TokenButton
          label="Roll"
          accessibilityLabel="Roll the die"
          tone="ember"
          disabled={!yourTurn || busy}
          onPress={() => onMove('roll')}
          style={styles.action}
        />
        <TokenButton
          label={view.turnPoints > 0 ? `Hold ${view.turnPoints}` : 'Hold'}
          accessibilityLabel={
            view.turnPoints > 0 ? `Hold and bank ${view.turnPoints} points` : 'Hold. Roll first.'
          }
          tone="chip"
          disabled={!yourTurn || busy || view.turnPoints === 0}
          onPress={() => onMove('hold')}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: { gap: 16 },
  scores: { flexDirection: 'row', gap: 12 },
  score: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    padding: 14,
    borderRadius: 20,
    borderWidth: 2,
  },
  table: {
    alignItems: 'center',
    gap: 4,
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
  },
  dieSlot: { height: 70, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
});
