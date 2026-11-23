import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@dyce/ui';
import { Disc } from './CheckersDisc';
import { needsConfirm, nameOfPlayer, plural, squareSizeFor } from './board-common';
import {
  ActionBar,
  GOLD,
  GlassButton,
  INK,
  MoveList,
  OpponentChip,
  ResignControl,
  TableStage,
  useArea,
  type ListedMove,
} from './board-ui';
import {
  SEAT_COLOUR,
  barCopy,
  boardSummary,
  candidates,
  completeMove,
  describeSquare,
  isDark,
  isKingPiece,
  jumpedSoFar,
  moveAction,
  movablePieces,
  mustJump,
  mySeat,
  nextSquares,
  pathLabel,
  pieceCounts,
  predictMove,
  seatOfPiece,
  squareName,
  visualOrder,
  type CheckersView,
} from './checkers-logic';
import type { BoardProps } from '../registry/types';

/** Colours from the design (PlayCheckers): a dark table in both themes. */
const DARK_SQ = '#2F2A26';
const LIGHT_SQ = '#E9D9B6';
const LAST_SQ = '#5A4A22';
const PICK_SQ = '#3A5A2A';

/**
 * Checkers as a play surface. Tap a piece that can move (only pieces that can jump when a jump is forced),
 * then tap the ringed squares one after another; a multi-jump is built one landing at a time and is sent as
 * one move. The legal moves are the server's own `legal` list. The move shows at once from the engine's
 * prediction. On squares under 44pt the button confirms the move; "Move list" lists every legal move for
 * anyone who would rather not tap the board.
 */
export function CheckersBoard({
  match,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
}: BoardProps<CheckersView>) {
  const seat = mySeat(view, myId);
  const oppId = view.players.find((p) => p !== myId) ?? view.players[seat === 0 ? 1 : 0] ?? null;
  const oppName = nameOfPlayer(players, oppId);
  const me = players.find((p) => p.userId === myId) ?? null;
  const opp = players.find((p) => p.userId === oppId) ?? null;
  const over = view.winner !== null || view.draw || match.status !== 'active';
  const canMove = yourTurn && !over && !busy;

  const { area, onLayout } = useArea();
  const [picked, setPicked] = useState<number[]>([]);
  const [pending, setPending] = useState<{
    seq: number;
    board: string;
    last: { path: number[]; captured: number[] };
  } | null>(null);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    setPicked([]);
    setPending(null);
  }, [view.seq]);
  useEffect(() => {
    if (moveFailed) setPending(null);
  }, [moveFailed]);

  const showing = pending && pending.seq === view.seq ? pending : null;
  const board = showing ? showing.board : view.board;
  const last = showing
    ? showing.last
    : view.last
      ? { path: view.last.path, captured: view.last.captured }
      : null;

  const square = squareSizeFor(area.w - 28, area.h - 8, 8, 8);
  const confirmFirst = needsConfirm(square);
  const movable = useMemo(() => movablePieces(view), [view]);
  const next = useMemo(() => new Set(nextSquares(view, picked)), [view, picked]);
  const struck = useMemo(() => new Set(jumpedSoFar(view, picked)), [view, picked]);
  const ready = picked.length > 1 ? completeMove(view, picked) : undefined;
  const forced = mustJump(view);

  const submit = (path: number[]) => {
    const guess = predictMove(view, path);
    if (guess) setPending({ seq: view.seq, board: guess.board, last: guess.last });
    setPicked([]);
    onMove(moveAction(path));
  };

  const extend = (path: number[]) => {
    if (completeMove(view, path)) {
      if (confirmFirst) setPicked(path);
      else submit(path);
    } else {
      setPicked(path);
    }
  };

  const tap = (sq: number) => {
    if (!canMove) return;
    if (picked.length === 0) {
      if (movable.has(sq)) setPicked([sq]);
      return;
    }
    if (!ready && next.has(sq)) {
      extend([...picked, sq]);
      return;
    }
    if (picked.length > 1 && sq === picked[picked.length - 1]) {
      setPicked(picked.slice(0, -1)); // undo the last landing
      return;
    }
    if (picked.length === 1 && sq === picked[0]) {
      setPicked([]);
      return;
    }
    if (picked.length === 1 && movable.has(sq)) setPicked([sq]);
  };

  const order = useMemo(() => visualOrder(seat), [seat]);
  const [a, b] = pieceCounts(board);
  const mine = seat === 1 ? b : a;
  const theirs = seat === 1 ? a : b;
  const oppColour = seat === 0 ? SEAT_COLOUR[1] : SEAT_COLOUR[0];

  const copy = barCopy(view, myId, oppName, canMove || (yourTurn && busy), picked);

  const list: ListedMove[] = view.legal
    .filter((m) => picked.length === 0 || candidates(view, picked).includes(m))
    .map((m) => ({
      key: m.path.join('-'),
      label: pathLabel(m.path, m.captured.length),
      selected: ready ? ready.path.join('-') === m.path.join('-') : false,
      onPress: () => {
        if (confirmFirst) setPicked(m.path);
        else submit(m.path);
      },
    }));

  return (
    <TableStage tone="warm">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <OpponentChip
          player={opp}
          name={oppName}
          text={`${oppName} · ${oppColour} · ${plural(theirs, 'piece')}`}
        />

        <View style={styles.area} onLayout={onLayout}>
          {area.w > 0 ? (
            <View accessibilityLabel={boardSummary(view, seat)} style={styles.frame}>
              <View
                style={{
                  width: square * 8,
                  height: square * 8,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                }}
              >
                {order.map((sq, n) => {
                  const ch = board[sq]!;
                  const owner = seatOfPiece(ch);
                  const dark = isDark(sq);
                  const isPick = picked.includes(sq);
                  const isNext = next.has(sq) && !ready;
                  const wasLast = last ? last.path.includes(sq) : false;
                  const wasTaken = last ? last.captured.includes(sq) : false;
                  const canPick = canMove && picked.length === 0 && movable.has(sq);
                  let bg = dark ? DARK_SQ : LIGHT_SQ;
                  if (dark && wasLast) bg = LAST_SQ;
                  if (dark && isPick) bg = PICK_SQ;
                  const label = [
                    describeSquare(board, sq, seat),
                    picked[0] === sq ? 'selected' : null,
                    isPick && picked[0] !== sq ? `step ${picked.indexOf(sq)} of your move` : null,
                    isNext ? 'you can move here' : null,
                    struck.has(sq) ? 'jumped' : null,
                    wasTaken ? 'a piece was taken here' : null,
                    canPick ? (forced ? 'can jump' : 'can move') : null,
                  ]
                    .filter(Boolean)
                    .join(', ');
                  const step = picked.indexOf(sq);
                  return (
                    <Pressable
                      key={sq}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected: isPick, disabled: !canMove }}
                      onPress={() => tap(sq)}
                      style={{ width: square, height: square, backgroundColor: bg }}
                    >
                      {ch !== '.' && owner !== null ? (
                        <View pointerEvents="none" style={styles.center}>
                          <Disc
                            size={square * 0.78}
                            seat={owner}
                            king={isKingPiece(ch)}
                            lifted={isPick && picked[0] === sq}
                          />
                          {canPick ? (
                            <View
                              style={[
                                styles.canPick,
                                { width: square * 0.9, height: square * 0.9, borderRadius: square },
                              ]}
                            />
                          ) : null}
                        </View>
                      ) : null}
                      {wasTaken && ch === '.' ? (
                        <Text
                          allowFontScaling={false}
                          style={[styles.cross, { fontSize: square * 0.5 }]}
                        >
                          ×
                        </Text>
                      ) : null}
                      {struck.has(sq) ? (
                        <Text
                          allowFontScaling={false}
                          style={[styles.cross, { fontSize: square * 0.5 }]}
                        >
                          ×
                        </Text>
                      ) : null}
                      {isNext || (isPick && step > 0) ? (
                        <View pointerEvents="none" style={styles.center}>
                          <View
                            style={{
                              width: square * 0.7,
                              height: square * 0.7,
                              borderRadius: square,
                              borderWidth: 3,
                              borderStyle: isPick ? 'solid' : 'dashed',
                              borderColor: GOLD,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {isPick ? (
                              <Text
                                allowFontScaling={false}
                                style={[styles.step, { fontSize: square * 0.34 }]}
                              >
                                {step}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      ) : null}
                      {n % 8 === 0 || n >= 56 ? (
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.coord,
                            n % 8 === 0 ? { left: 2, top: 1 } : { right: 2, bottom: 1 },
                            { color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' },
                          ]}
                        >
                          {n % 8 === 0 ? squareName(sq).slice(1) : squareName(sq)[0]}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.row}>
          <GlassButton
            label={listOpen ? 'Hide move list' : 'Move list'}
            accessibilityLabel={listOpen ? 'Hide the list of legal moves' : 'List every legal move'}
            selected={listOpen}
            disabled={!canMove}
            onPress={() => setListOpen((v) => !v)}
          />
          {picked.length > 0 ? (
            <GlassButton
              label={picked.length > 1 ? 'Undo step' : 'Clear'}
              accessibilityLabel={
                picked.length > 1
                  ? 'Undo the last square of this move'
                  : `Put ${squareName(picked[0]!)} down`
              }
              onPress={() => setPicked(picked.length > 1 ? picked.slice(0, -1) : [])}
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
            title={picked.length > 0 ? `Moves for ${squareName(picked[0]!)}` : 'All legal moves'}
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
                : `${copy.subtitle ?? ''}${copy.subtitle ? ' · ' : ''}${plural(mine, 'piece')} left`
          }
          actionLabel={ready && confirmFirst ? (ready.captured.length > 0 ? 'Jump' : 'Move') : null}
          onAction={() => ready && submit(ready.path)}
          accessibilityLabel={ready ? `${copy.title}. Play ${pathLabel(ready.path)}.` : undefined}
        />
      </ScrollView>
    </TableStage>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, gap: 10 },
  area: { flexGrow: 1, minHeight: 8 * 36 + 28, alignItems: 'center', justifyContent: 'center' },
  frame: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#4A2E1C',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  canPick: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(227,169,59,0.85)' },
  cross: {
    position: 'absolute',
    alignSelf: 'center',
    top: '18%',
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'Figtree_800ExtraBold',
  },
  step: { color: INK, fontFamily: 'Figtree_800ExtraBold' },
  coord: { position: 'absolute', fontSize: 9, fontFamily: 'Figtree_800ExtraBold' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
