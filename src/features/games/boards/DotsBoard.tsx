import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@dyce/ui';
import { nameOfPlayer, plural, seatOf } from './board-common';
import {
  ActionBar,
  GOLD,
  GlassButton,
  INK,
  ME_COLOUR,
  MoveList,
  OpponentChip,
  ResignControl,
  SOFT,
  THEM_COLOUR,
  TableStage,
  useArea,
  type ListedMove,
} from './board-ui';
import {
  barCopy,
  boardSummary,
  boxMark,
  boxesLeft,
  isOpen,
  lineLabel,
  lineOwner,
  moveAction,
  openLines,
  predictLine,
  sameLine,
  sideOf,
  type DotsView,
  type Line,
} from './dots-logic';
import type { BoardProps } from '../registry/types';

/** Paper and ink from the design (PlayDotsBoxes): a fixed dark table with a sheet of squared paper. */
const PAPER = '#F6EEDC';
const PAPER_EDGE = '#B9A57E';
const ME_EDGE = '#8A2410';
const THEM_EDGE = '#12307A';
const BAR = 8;
const PAD = 26;
/** A line's touch zone is at least this thick across, and runs along the line between its two dots. */
const ZONE = 44;
const END_GAP = 14;

/**
 * Dots & Boxes as a play surface. Tap a line to choose it (it shows dashed, with what it would do: close a box,
 * give one away, or neither), then tap it again or press Draw. Closing a box scores it and you go again. The
 * board is the server's `view`; the drawn line shows at once from the engine's prediction. Every open line is
 * a labelled button, and "Line list" lists the same lines in words for anyone who would rather not tap the
 * board. The board is as large as the screen allows (a line's touch zone is 44pt across; at least 200pt wide).
 */
export function DotsBoard({
  match,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
}: BoardProps<DotsView>) {
  const seat = seatOf(view.players, myId);
  const oppId = view.players.find((p) => p !== myId) ?? view.players[seat === 0 ? 1 : 0] ?? null;
  const oppName = nameOfPlayer(players, oppId);
  const me = players.find((p) => p.userId === myId) ?? null;
  const opp = players.find((p) => p.userId === oppId) ?? null;
  const over = view.winner !== null || view.draw || match.status !== 'active';
  const canMove = yourTurn && !over && !busy;

  const { area, onLayout } = useArea();
  const [selected, setSelected] = useState<Line | null>(null);
  const [pending, setPending] = useState<{ seq: number; shown: DotsView } | null>(null);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    setSelected(null);
    setPending(null);
  }, [view.seq]);
  useEffect(() => {
    if (moveFailed) setPending(null);
  }, [moveFailed]);

  const shown = pending && pending.seq === view.seq ? pending.shown : view;
  const n = view.dots;
  const side = sideOf(view);
  const span = Math.max(
    200,
    Math.min(area.w - 28 - PAD * 2, 400, area.h > 0 ? area.h - PAD * 2 : 400),
  );
  const step = span / side;
  const paper = span + PAD * 2;

  const mine = seat ?? 0;
  const colourOf = (owner: number) => (owner === mine ? ME_COLOUR : THEM_COLOUR);
  const edgeOf = (owner: number) => (owner === mine ? ME_EDGE : THEM_EDGE);

  const submit = (line: Line) => {
    const guess = predictLine(view, line);
    if (guess) setPending({ seq: view.seq, shown: guess });
    setSelected(null);
    onMove(moveAction(line));
  };

  const tapLine = (line: Line) => {
    if (!canMove || !isOpen(view, line)) return;
    if (sameLine(selected, line)) submit(line);
    else setSelected(line);
  };

  const open = useMemo(() => openLines(view), [view]);
  const lines: Line[] = useMemo(() => {
    const out: Line[] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n - 1; c++) out.push({ dir: 'h', r, c });
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n; c++) out.push({ dir: 'v', r, c });
    return out;
  }, [n]);

  const copy = barCopy(view, myId, oppName, canMove || (yourTurn && busy), selected);
  const myScore = shown.scores[mine]!;
  const theirScore = shown.scores[mine === 0 ? 1 : 0]!;
  const left = boxesLeft(shown);
  const last = shown.last;

  const list: ListedMove[] = open.map((l) => ({
    key: `${l.dir}${l.r}-${l.c}`,
    label: lineLabel(view, l, seat),
    selected: sameLine(selected, l),
    onPress: () => tapLine(l),
  }));

  const barePos = (l: Line) =>
    l.dir === 'h'
      ? {
          left: PAD + l.c * step + BAR - 2,
          top: PAD + l.r * step - BAR / 2,
          width: step - BAR * 2 + 4,
          height: BAR,
        }
      : {
          left: PAD + l.c * step - BAR / 2,
          top: PAD + l.r * step + BAR - 2,
          width: BAR,
          height: step - BAR * 2 + 4,
        };
  const zonePos = (l: Line) =>
    l.dir === 'h'
      ? {
          left: PAD + l.c * step + END_GAP,
          top: PAD + l.r * step - ZONE / 2,
          width: step - END_GAP * 2,
          height: ZONE,
        }
      : {
          left: PAD + l.c * step - ZONE / 2,
          top: PAD + l.r * step + END_GAP,
          width: ZONE,
          height: step - END_GAP * 2,
        };

  return (
    <TableStage>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <OpponentChip
          player={opp}
          name={oppName}
          text={`${oppName} · blue · ${plural(theirScore, 'box')}`}
        />

        <View style={styles.area} onLayout={onLayout}>
          {area.w > 0 ? (
            <View
              accessibilityLabel={boardSummary(shown, seat, oppName)}
              style={{
                width: paper,
                height: paper,
                borderRadius: 18,
                backgroundColor: PAPER,
                boxShadow: `0px 8px 0px ${PAPER_EDGE}`,
              }}
            >
              {/* boxes */}
              {shown.boxes.map((owner, i) => {
                if (owner < 0) return null;
                const br = Math.floor(i / side);
                const bc = i % side;
                return (
                  <View
                    key={`b${i}`}
                    accessible
                    accessibilityLabel={`Box row ${br + 1}, column ${bc + 1}, ${owner === mine ? 'yours' : `${oppName}'s`}`}
                    style={[
                      styles.box,
                      {
                        left: PAD + bc * step + 5,
                        top: PAD + br * step + 5,
                        width: step - 10,
                        height: step - 10,
                        backgroundColor:
                          owner === mine ? 'rgba(201,62,28,0.85)' : 'rgba(36,87,214,0.85)',
                      },
                    ]}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[styles.mark, { fontSize: Math.max(14, step * 0.3) }]}
                    >
                      {boxMark(owner === mine, oppName)}
                    </Text>
                  </View>
                );
              })}
              {/* the lines: drawn ones in their owner's colour, open ones as a faint groove */}
              {lines.map((l) => {
                const owner = lineOwner(shown, l);
                const isSel = sameLine(selected, l);
                const isLast =
                  last !== null && last.dir === l.dir && last.r === l.r && last.c === l.c;
                return (
                  <View
                    key={`l${l.dir}${l.r}-${l.c}`}
                    pointerEvents="none"
                    style={[
                      styles.bar,
                      barePos(l),
                      owner >= 0
                        ? {
                            backgroundColor: colourOf(owner),
                            boxShadow: `0px 3px 0px ${edgeOf(owner)}`,
                            borderWidth: isLast ? 2 : 0,
                            borderColor: '#1B140F',
                          }
                        : isSel
                          ? {
                              borderWidth: 3,
                              borderStyle: 'dashed',
                              borderColor: GOLD,
                              backgroundColor: 'rgba(227,169,59,0.25)',
                            }
                          : { backgroundColor: 'rgba(27,20,15,0.08)' },
                    ]}
                  />
                );
              })}
              {/* the dots */}
              {Array.from({ length: n * n }, (_, i) => (
                <View
                  key={`d${i}`}
                  pointerEvents="none"
                  style={[
                    styles.dot,
                    { left: PAD + (i % n) * step - 7, top: PAD + Math.floor(i / n) * step - 7 },
                  ]}
                />
              ))}
              {/* touch zones for the open lines */}
              {canMove
                ? open.map((l) => (
                    <Pressable
                      key={`z${l.dir}${l.r}-${l.c}`}
                      accessibilityRole="button"
                      accessibilityLabel={lineLabel(view, l, seat)}
                      accessibilityState={{ selected: sameLine(selected, l) }}
                      accessibilityHint={
                        sameLine(selected, l) ? 'Press again to draw it' : 'Selects the line'
                      }
                      onPress={() => tapLine(l)}
                      style={[styles.zone, zonePos(l)]}
                    />
                  ))
                : null}
            </View>
          ) : null}
        </View>

        <View
          accessible
          accessibilityLabel={`You ${myScore} ${plural(myScore, 'box')}. ${left} left. ${oppName} ${theirScore}.`}
          style={styles.scores}
        >
          <Text variant="callout" style={{ color: '#FF8F6B' }}>
            You · {myScore}
          </Text>
          <Text variant="footnote" color={SOFT}>
            {plural(left, 'box')} left
          </Text>
          <Text variant="callout" style={{ color: '#8FB8FF' }}>
            {oppName} · {theirScore}
          </Text>
        </View>

        <View style={styles.row}>
          <GlassButton
            label={listOpen ? 'Hide line list' : 'Line list'}
            accessibilityLabel={listOpen ? 'Hide the list of open lines' : 'List every open line'}
            selected={listOpen}
            disabled={!canMove}
            onPress={() => setListOpen((v) => !v)}
          />
          {selected ? (
            <GlassButton
              label="Clear"
              accessibilityLabel="Clear the chosen line"
              onPress={() => setSelected(null)}
            />
          ) : null}
          <ResignControl
            available={yourTurn && !over}
            busy={busy}
            onResign={() => onMove({ kind: 'resign' })}
          />
        </View>

        {listOpen && canMove ? (
          <MoveList title="Open lines" moves={list} empty="No lines left." />
        ) : null}

        <ActionBar
          me={me}
          myName={nameOfPlayer(players, myId)}
          yourTurn={canMove}
          title={copy.title}
          subtitle={
            busy
              ? 'Sending your line…'
              : moveFailed && yourTurn
                ? 'That did not go through. Try again.'
                : copy.subtitle
          }
          actionLabel={selected ? 'Draw' : null}
          onAction={() => selected && submit(selected)}
          accessibilityLabel={
            selected ? `${copy.title}. ${lineLabel(view, selected, seat)}` : undefined
          }
        />
      </ScrollView>
    </TableStage>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, gap: 10 },
  area: { flexGrow: 1, minHeight: 200 + PAD * 2, alignItems: 'center', justifyContent: 'center' },
  box: {
    position: 'absolute',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { color: INK, fontFamily: 'BricolageGrotesque_800ExtraBold' },
  bar: { position: 'absolute', borderRadius: 4 },
  dot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1B140F',
    boxShadow: '0px 3px 0px #000000',
  },
  zone: { position: 'absolute' },
  scores: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
