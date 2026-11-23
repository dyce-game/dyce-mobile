import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ChessPromotion } from '@dyce/games';
import { Text } from '@dyce/ui';
import { ChessPiece } from './ChessPiece';
import { needsConfirm, nameOfPlayer, seatOf, squareSizeFor } from './board-common';
import {
  ActionBar,
  GlassButton,
  INK,
  MoveList,
  OpponentChip,
  ResignControl,
  SOFT,
  TableStage,
  useArea,
  GOLD,
  type ListedMove,
} from './board-ui';
import {
  PROMOTION_LABEL,
  barCopy,
  boardSummary,
  capturedPieces,
  describeSquare,
  isLightSquare,
  kingIndex,
  listedMoves,
  moveAction,
  movableSquares,
  predictMove,
  promotionChoices,
  sideOf,
  squareOf,
  targetsFrom,
  visualOrder,
  type Side,
  type ChessView,
} from './chess-logic';
import type { BoardProps } from '../registry/types';

/** Colours from the design (PlayChess): a wooden board on a fixed dark table in both themes. */
const LIGHT = '#E8D3AE';
const DARK = '#9A6B42';
const LAST_LIGHT = '#E9D27A';
const LAST_DARK = '#C2A24A';
const CHECK = 'rgba(224,69,58,0.78)';
const HINT = 'rgba(201,62,28,0.78)';

/**
 * Chess as a play surface. It draws the server's view (your side at the bottom), shows the legal moves of the
 * piece you pick (the server's own `legal` list), and sends `{kind:'move', from, to, promotion?}`. A move is
 * shown at once from the engine's own prediction and corrected by the server's answer. Squares are as large as
 * the screen allows (at least 36pt, 44pt on a normal phone); below 44pt a tap only chooses and the Move button
 * confirms. Every square is a labelled button, and the "Move list" lists the same legal moves for anyone who
 * would rather not tap the board.
 */
export function ChessBoard({
  match,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
}: BoardProps<ChessView>) {
  const side = sideOf(view, myId);
  const seat = seatOf(view.players, myId);
  const oppId = view.players.find((p) => p !== myId) ?? view.players[seat === 0 ? 1 : 0] ?? null;
  const oppName = nameOfPlayer(players, oppId);
  const me = players.find((p) => p.userId === myId) ?? null;
  const opp = players.find((p) => p.userId === oppId) ?? null;
  const over = view.winner !== null || view.draw || match.status !== 'active';
  const canMove = yourTurn && !over && !busy;

  const { area, onLayout } = useArea();
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<{ from: string; to: string } | null>(null);
  const [pending, setPending] = useState<{
    seq: number;
    board: string;
    last: { from: string; to: string };
    check: boolean;
  } | null>(null);
  const [listOpen, setListOpen] = useState(false);

  // A new position from the server (or a refused move) clears everything that was in flight.
  useEffect(() => {
    setSelected(null);
    setTarget(null);
    setChoosing(null);
    setPending(null);
  }, [view.seq]);
  useEffect(() => {
    if (moveFailed) setPending(null);
  }, [moveFailed]);

  const showing = pending && pending.seq === view.seq ? pending : null;
  const board = showing ? showing.board : view.board;
  const lastSquares = showing
    ? showing.last
    : view.last
      ? { from: view.last.from, to: view.last.to }
      : null;

  const movable = useMemo(() => movableSquares(view), [view]);
  const targets = useMemo(() => (selected ? targetsFrom(view, selected) : []), [view, selected]);
  const targetMap = useMemo(() => new Map(targets.map((t) => [t.to, t])), [targets]);

  const square = squareSizeFor(area.w - 28, area.h - 8, 8, 8);
  const confirmFirst = needsConfirm(square);
  const boardPx = square * 8;

  const submit = (from: string, to: string, promotion?: ChessPromotion) => {
    const guess = predictMove(view, from, to, promotion);
    if (guess)
      setPending({ seq: view.seq, board: guess.board, last: guess.last, check: guess.check });
    setSelected(null);
    setTarget(null);
    setChoosing(null);
    onMove(moveAction(from, to, promotion));
  };

  const chooseTarget = (from: string, to: string) => {
    const t = targetMap.get(to) ?? targetsFrom(view, from).find((x) => x.to === to);
    if (!t) return;
    if (t.promotes) {
      setChoosing({ from, to });
      setTarget(to);
    } else if (confirmFirst) {
      setTarget(to);
    } else {
      submit(from, to);
    }
  };

  const tap = (index: number) => {
    if (!canMove) return;
    const sq = squareOf(index);
    if (selected && targetMap.has(sq)) {
      chooseTarget(selected, sq);
      return;
    }
    if (movable.has(sq) && sq !== selected) {
      setSelected(sq);
      setTarget(null);
      setChoosing(null);
      return;
    }
    setSelected(null);
    setTarget(null);
    setChoosing(null);
  };

  const order = useMemo(() => visualOrder(side), [side]);
  const inCheck = showing ? showing.check : view.check;
  const checkedSide: Side = showing ? (side === 'w' ? 'b' : 'w') : view.turn === 0 ? 'w' : 'b';
  const kingSq = inCheck ? kingIndex(board, checkedSide) : -1;
  const taken = useMemo(() => capturedPieces(board), [board]);
  const myTaken = side === 'w' ? taken.white : taken.black;
  const theirTaken = side === 'w' ? taken.black : taken.white;
  const myLead = side === 'w' ? taken.lead : -taken.lead;

  const confirmReady = confirmFirst && selected !== null && target !== null && choosing === null;
  const base = barCopy(
    view,
    myId,
    oppName,
    canMove || (yourTurn && busy),
    selected,
    targets.length,
  );
  const copy = confirmReady
    ? { title: `Move ${selected} to ${target}`, subtitle: 'Press Move to play it' }
    : base;
  const oppColour = side === 'w' ? 'black' : 'white';
  const oppText = over
    ? `${oppName} · ${oppColour}`
    : yourTurn
      ? `${oppName} · ${oppColour}${view.last && view.last.by !== myId ? ` · played ${view.last.san}` : ''}`
      : `${oppName} · ${oppColour} · thinking…`;

  const list: ListedMove[] = listedMoves(view)
    .filter((m) => selected === null || m.from === selected)
    .map((m) => ({
      key: `${m.from}${m.to}`,
      label: m.label,
      selected: target === m.to && selected === m.from,
      onPress: () => {
        setSelected(m.from);
        chooseTarget(m.from, m.to);
      },
    }));

  return (
    <TableStage tone="warm">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <OpponentChip player={opp} name={oppName} text={oppText} />

        <View
          accessible
          accessibilityLabel={`You have taken ${myTaken.length} ${myTaken.length === 1 ? 'piece' : 'pieces'}. ${oppName} has taken ${theirTaken.length}.`}
          style={styles.taken}
        >
          <TakenRow pieces={myTaken} lead={myLead} />
          <TakenRow pieces={theirTaken} lead={0} align="right" />
        </View>

        <View style={styles.area} onLayout={onLayout}>
          {area.w > 0 ? (
            <View
              accessibilityLabel={boardSummary(view, side)}
              style={[styles.frame, { padding: 10 }]}
            >
              <View
                style={{ width: boardPx, height: boardPx, flexDirection: 'row', flexWrap: 'wrap' }}
              >
                {order.map((index, n) => {
                  const sq = squareOf(index);
                  const ch = board[index]!;
                  const light = isLightSquare(index);
                  const isLast = lastSquares && (lastSquares.from === sq || lastSquares.to === sq);
                  const isSel = selected === sq;
                  const isTarget = targetMap.get(sq);
                  const picked = target === sq && selected !== null;
                  let bg = light ? LIGHT : DARK;
                  if (isLast) bg = light ? LAST_LIGHT : LAST_DARK;
                  if (isSel || picked) bg = GOLD;
                  const col = n % 8;
                  const row = Math.floor(n / 8);
                  const label = [
                    describeSquare(board, index),
                    isSel ? 'selected' : null,
                    isTarget ? (isTarget.capture ? 'capture here' : 'legal move') : null,
                    isLast ? 'last move' : null,
                    kingSq === index ? 'in check' : null,
                    !isSel && canMove && movable.has(sq) && ch !== '.' ? 'can move' : null,
                  ]
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <Pressable
                      key={index}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected: isSel, disabled: !canMove }}
                      onPress={() => tap(index)}
                      style={{ width: square, height: square, backgroundColor: bg }}
                    >
                      {kingSq === index ? (
                        <View
                          pointerEvents="none"
                          style={[styles.fill, { backgroundColor: CHECK, borderRadius: square }]}
                        />
                      ) : null}
                      {ch !== '.' ? (
                        <View pointerEvents="none" style={styles.piece}>
                          <ChessPiece piece={ch} size={square * 0.92} />
                        </View>
                      ) : null}
                      {isTarget ? (
                        <View pointerEvents="none" style={styles.piece}>
                          <View
                            style={[
                              isTarget.capture
                                ? {
                                    width: square * 0.86,
                                    height: square * 0.86,
                                    borderRadius: square,
                                    borderWidth: Math.max(3, square * 0.08),
                                    borderColor: HINT,
                                  }
                                : {
                                    width: square * 0.3,
                                    height: square * 0.3,
                                    borderRadius: square,
                                    backgroundColor: HINT,
                                  },
                            ]}
                          />
                        </View>
                      ) : null}
                      {row === 7 ? (
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.coord,
                            { right: 2, bottom: 1, color: light ? DARK : LIGHT },
                          ]}
                        >
                          {sq[0]}
                        </Text>
                      ) : null}
                      {col === 0 ? (
                        <Text
                          allowFontScaling={false}
                          style={[styles.coord, { left: 2, top: 1, color: light ? DARK : LIGHT }]}
                        >
                          {sq[1]}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>

        {choosing ? (
          <View style={styles.row} accessibilityRole="alert">
            <Text variant="footnote" color={INK}>
              Promote to
            </Text>
            {promotionChoices(view, choosing.from, choosing.to).map((p) => (
              <GlassButton
                key={p}
                label={PROMOTION_LABEL[p]}
                accessibilityLabel={`Promote to a ${PROMOTION_LABEL[p].toLowerCase()}`}
                onPress={() => submit(choosing.from, choosing.to, p)}
              />
            ))}
            <GlassButton
              label="Cancel"
              onPress={() => {
                setChoosing(null);
                setTarget(null);
              }}
            />
          </View>
        ) : null}

        <View style={styles.row}>
          <GlassButton
            label={listOpen ? 'Hide move list' : 'Move list'}
            accessibilityLabel={listOpen ? 'Hide the list of legal moves' : 'List every legal move'}
            selected={listOpen}
            disabled={!canMove}
            onPress={() => setListOpen((v) => !v)}
          />
          {selected ? (
            <GlassButton
              label="Clear"
              accessibilityLabel={`Put ${selected} down`}
              onPress={() => {
                setSelected(null);
                setTarget(null);
                setChoosing(null);
              }}
            />
          ) : null}
          <ResignControl
            available={yourTurn && !over}
            busy={busy}
            onResign={() => onMove({ kind: 'resign' })}
          />
        </View>

        {listOpen && canMove ? (
          <MoveList
            title={selected ? `Moves for ${selected}` : 'All legal moves'}
            moves={list}
            empty="No legal moves."
          />
        ) : null}

        <ActionBar
          me={me}
          myName={nameOfPlayer(players, myId)}
          yourTurn={canMove}
          title={copy.title}
          subtitle={
            busy
              ? 'Sending your move…'
              : moveFailed && yourTurn
                ? 'That did not go through. Try again.'
                : copy.subtitle
          }
          actionLabel={confirmReady ? 'Move' : null}
          onAction={() => selected && target && submit(selected, target)}
        />
      </ScrollView>
    </TableStage>
  );
}

function TakenRow({ pieces, lead, align }: { pieces: string[]; lead: number; align?: 'right' }) {
  return (
    <View style={[styles.takenRow, align === 'right' ? styles.takenRight : null]}>
      {pieces.map((p, i) => (
        <ChessPiece key={i} piece={p} size={16} />
      ))}
      {lead > 0 ? (
        <Text variant="footnote" color={SOFT}>
          +{lead}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, gap: 10 },
  area: { flexGrow: 1, minHeight: 8 * 36 + 28, alignItems: 'center', justifyContent: 'center' },
  frame: {
    borderRadius: 14,
    backgroundColor: '#6B4220',
    borderWidth: 2,
    borderColor: 'rgba(255,220,170,0.25)',
  },
  fill: { ...StyleSheet.absoluteFill },
  piece: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  coord: { position: 'absolute', fontSize: 9, fontFamily: 'Figtree_800ExtraBold' },
  taken: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 20,
    paddingHorizontal: 8,
  },
  takenRow: { flexDirection: 'row', alignItems: 'center', gap: 1, flexWrap: 'wrap', flex: 1 },
  takenRight: { justifyContent: 'flex-end' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
