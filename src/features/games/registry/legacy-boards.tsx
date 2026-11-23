import { StyleSheet, View } from 'react-native';
import { brand } from '@dyce/ui';
import { CupPongArt } from '../boards/CupPongArt';
import { CupPongBoard } from '../boards/CupPongBoard';
import { WordHuntArt } from '../boards/WordHuntArt';
import { WordHuntBoard } from '../boards/WordHuntBoard';
import { DieFace } from '../components/DieFace';
import { PigBoard } from '../components/PigBoard';
import type { CupPongView } from '../boards/cup-pong-logic';
import type { PigView, WordHuntView } from '../games-logic';
import type { ArtProps, BoardProps } from './types';

/**
 * The three games that existed before the registry (Pig, Word Hunt, Cup Pong), fitted to `BoardProps` and
 * `ArtProps` without changing how they look or play. New games do not need a file like this: they take
 * `BoardProps` and `ArtProps` directly.
 */

/** The size of a game's picture on the results screen. */
const HERO = { width: 150, height: 120, borderRadius: 22 } as const;

// ---- Pig -------------------------------------------------------------------------------------------

export function PigGameBoard({ view, players, myId, yourTurn, busy, onMove }: BoardProps<PigView>) {
  return (
    <PigBoard
      view={view}
      players={players}
      myId={myId}
      yourTurn={yourTurn}
      busy={busy}
      onMove={(kind) => onMove({ kind })}
    />
  );
}

export function PigArt({ style, compact, dice, hero }: ArtProps) {
  if (hero) {
    return (
      <View style={styles.heroDice} aria-hidden>
        <DieFace value={4} size={60} rotate={-10} />
        <DieFace value={4} size={60} rotate={10} />
      </View>
    );
  }
  const size = dice ?? (compact ? 38 : 50);
  return (
    <View aria-hidden style={[styles.felt, style]}>
      <DieFace value={5} size={size} rotate={-12} />
      <View style={{ marginTop: size * 0.5 }}>
        <DieFace value={3} size={size} rotate={14} />
      </View>
    </View>
  );
}

// ---- Word Hunt -------------------------------------------------------------------------------------

export function WordHuntGameBoard({
  matchId,
  view,
  players,
  myId,
  busy,
  onMove,
}: BoardProps<WordHuntView>) {
  return (
    <WordHuntBoard
      matchId={matchId}
      view={view}
      players={players}
      myId={myId}
      busy={busy}
      onMove={onMove}
    />
  );
}

export function WordHuntGameArt({ style, compact, dice, hero }: ArtProps) {
  if (hero) return <WordHuntArt size={50} style={HERO} />;
  return <WordHuntArt size={dice ?? (compact ? 38 : 50)} style={style} end={compact} />;
}

// ---- Cup Pong --------------------------------------------------------------------------------------

export function CupPongGameBoard({
  matchId,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
  onSettled,
}: BoardProps<CupPongView>) {
  return (
    <CupPongBoard
      matchId={matchId}
      view={view}
      players={players}
      myId={myId}
      yourTurn={yourTurn}
      busy={busy}
      moveFailed={moveFailed}
      onMove={onMove as Parameters<typeof CupPongBoard>[0]['onMove']}
      onSettled={onSettled}
    />
  );
}

export function CupPongGameArt({ style, hero }: ArtProps) {
  return <CupPongArt style={hero ? HERO : style} />;
}

const styles = StyleSheet.create({
  felt: {
    backgroundColor: brand.felt.fill,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroDice: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: brand.felt.fill,
    padding: 18,
    borderRadius: 22,
  },
});
