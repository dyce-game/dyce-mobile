import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { Text } from '@dyce/ui';
import { MAX_BOARD, nameOfPlayer, plural } from './board-common';
import { ActionBar, OpponentChip, ResignControl, SOFT, TableStage, useArea } from './board-ui';
import {
  COLOURS,
  COLS,
  MAJORITY,
  ROWS,
  SHAPES,
  barCopy,
  boardSummary,
  chipLabel,
  colourName,
  countOf,
  gainOf,
  holder,
  isPickable,
  mySeat,
  pickAction,
  predictPick,
  shapePath,
  type FillerView,
} from './filler-logic';
import type { BoardProps } from '../registry/types';

const GAP = 3;
const FRAME = 10;
/** Room above the grid for the raised squares of your region. */
const RAISE = 6;

/**
 * Filler as a play surface. The 8 x 7 grid is drawn from the server's `view`: your region is raised with a white
 * outline, theirs with a dark one, and every colour also has its own shape so colour is never the only cue.
 * Tap a colour to see how many squares it would win (the engine's own count), then tap it again or press Pick.
 * The colour you hold and the one they hold are greyed and labelled. The pick shows at once from the engine's
 * prediction; the server decides. The board is as large as the screen allows (squares of at least 36pt on a
 * 320pt-wide phone); the six colour buttons are 48pt.
 */
export function FillerBoard({
  match,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
}: BoardProps<FillerView>) {
  const seat = mySeat(view, myId);
  const oppId = view.players.find((p) => p !== myId) ?? view.players[seat === 0 ? 1 : 0] ?? null;
  const oppName = nameOfPlayer(players, oppId);
  const me = players.find((p) => p.userId === myId) ?? null;
  const opp = players.find((p) => p.userId === oppId) ?? null;
  const over = view.over || match.status !== 'active';
  const canMove = yourTurn && !over && !busy;

  const { area, onLayout } = useArea();
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<{ seq: number; shown: FillerView } | null>(null);

  useEffect(() => {
    setSelected(null);
    setPending(null);
  }, [view.turns]);
  useEffect(() => {
    if (moveFailed) setPending(null);
  }, [moveFailed]);

  const shown = pending && pending.seq === view.turns ? pending.shown : view;
  const gridW = Math.min(area.w - 28 - FRAME * 2, MAX_BOARD);
  const cell = Math.max(36, Math.floor(gridW / COLS));
  const mine = seat ?? 0;

  const submit = (colour: number) => {
    const guess = predictPick(view, colour);
    if (guess) setPending({ seq: view.turns, shown: guess });
    setSelected(null);
    onMove(pickAction(colour));
  };

  const tapColour = (colour: number) => {
    if (!canMove || !isPickable(view, colour)) return;
    if (selected === colour) submit(colour);
    else setSelected(colour);
  };

  const copy = barCopy(view, myId, oppName, canMove || (yourTurn && busy), selected, seat);
  const myCount = countOf(shown, myId);
  const theirCount = countOf(shown, oppId);
  const oppNote =
    !over && !yourTurn
      ? 'thinking…'
      : view.last && view.last.by !== myId
        ? `picked ${colourName(view.last.colour).toLowerCase()}`
        : plural(theirCount, 'square');

  return (
    <TableStage>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <OpponentChip player={opp} name={oppName} text={`${oppName} · ${oppNote}`} />

        <View style={styles.area} onLayout={onLayout}>
          {area.w > 0 ? (
            <View
              accessible
              accessibilityLabel={boardSummary(shown, myId, oppName)}
              style={[styles.frame, { padding: FRAME }]}
            >
              <Svg width={cell * COLS} height={cell * ROWS + RAISE}>
                <G transform={`translate(0 ${RAISE})`}>
                  {shown.cells.map((colour, i) => {
                    const r = Math.floor(i / COLS);
                    const c = i % COLS;
                    const own = shown.owner[i]!;
                    const spec = COLOURS[colour]!;
                    const x = c * cell;
                    const y = r * cell;
                    const s = cell - GAP;
                    const lift = own !== 0 ? Math.max(3, cell * 0.1) : 0;
                    const shape = SHAPES[colour]!;
                    const isMe = own === mine + 1;
                    return (
                      <G key={i}>
                        <Rect
                          x={x}
                          y={y + (own !== 0 ? 0 : 2)}
                          width={s}
                          height={s}
                          rx={6}
                          fill={spec.edge}
                        />
                        <Rect
                          x={x}
                          y={y - lift + (own !== 0 ? 0 : 0)}
                          width={s}
                          height={s}
                          rx={6}
                          fill={spec.fill}
                        />
                        <Path
                          d={`M${x + 6} ${y - lift} h${s - 12} a6 6 0 0 1 6 6 v6 L${x} ${y - lift + s * 0.55} v${-(s * 0.55 - 6)} a6 6 0 0 1 6 -6 Z`}
                          fill="#FFFFFF"
                          opacity={0.16}
                        />
                        <Path
                          d={shapePath(shape, x + s / 2, y - lift + s / 2, s * 0.2)}
                          fill="#FFFFFF"
                          opacity={own !== 0 ? 0.9 : 0.42}
                        />
                        {own !== 0 ? (
                          isMe ? (
                            <Rect
                              x={x + 1.5}
                              y={y - lift + 1.5}
                              width={s - 3}
                              height={s - 3}
                              rx={5}
                              fill="none"
                              stroke="#FFFFFF"
                              strokeWidth={3}
                            />
                          ) : (
                            <>
                              <Rect
                                x={x + 0.5}
                                y={y - lift + 0.5}
                                width={s - 1}
                                height={s - 1}
                                rx={6}
                                fill="none"
                                stroke="#FFFFFF"
                                strokeWidth={1}
                              />
                              <Rect
                                x={x + 2.5}
                                y={y - lift + 2.5}
                                width={s - 5}
                                height={s - 5}
                                rx={4}
                                fill="none"
                                stroke="#0B0908"
                                strokeWidth={3}
                              />
                            </>
                          )
                        ) : null}
                      </G>
                    );
                  })}
                </G>
              </Svg>
            </View>
          ) : null}
        </View>

        <View
          accessible
          accessibilityLabel={`You hold ${plural(myCount, 'square')}. ${oppName} holds ${theirCount}. ${MAJORITY} wins.`}
          style={styles.scores}
        >
          <Text variant="callout" style={{ color: '#FF8F6B' }}>
            You · {plural(myCount, 'square')}
          </Text>
          <Text variant="footnote" color={SOFT}>
            {MAJORITY} wins
          </Text>
          <Text variant="callout" style={{ color: '#8FB8FF' }}>
            {oppName} · {theirCount}
          </Text>
        </View>

        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Pick a colour"
          style={styles.chips}
        >
          {COLOURS.map((spec, colour) => {
            const h = holder(view, colour, seat);
            const ok = isPickable(view, colour);
            const on = selected === colour;
            return (
              <View key={spec.name} style={styles.chipCol}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={chipLabel(view, colour, seat)}
                  accessibilityHint={on ? 'Press again to pick it' : undefined}
                  accessibilityState={{ selected: on, disabled: !canMove || !ok }}
                  disabled={!canMove || !ok}
                  onPress={() => tapColour(colour)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: spec.fill,
                      boxShadow: `0px 5px 0px ${spec.edge}`,
                      opacity: ok ? 1 : 0.3,
                      borderColor: on ? '#FFFFFF' : 'transparent',
                    },
                  ]}
                >
                  <Svg width={22} height={22} viewBox="0 0 22 22">
                    <Path d={shapePath(SHAPES[colour]!, 11, 11, 8)} fill="#FFFFFF" opacity={0.92} />
                  </Svg>
                </Pressable>
                <Text variant="caption" color={SOFT} style={styles.chipNote} allowFontScaling>
                  {h === 'you'
                    ? 'You'
                    : h === 'them'
                      ? 'Them'
                      : yourTurn && !over
                        ? `+${gainOf(view, colour)}`
                        : ' '}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.row}>
          <ResignControl
            available={yourTurn && !over}
            busy={busy}
            onResign={() => onMove({ kind: 'resign' })}
          />
        </View>

        <ActionBar
          me={me}
          myName={nameOfPlayer(players, myId)}
          yourTurn={canMove}
          title={copy.title}
          subtitle={
            busy
              ? 'Sending your pick…'
              : moveFailed && yourTurn
                ? 'That did not go through. Try again.'
                : copy.subtitle
          }
          actionLabel={selected !== null ? 'Pick' : null}
          actionTone="felt"
          onAction={() => selected !== null && submit(selected)}
          accessibilityLabel={
            selected !== null
              ? `${copy.title}. Press Pick to play ${colourName(selected)}.`
              : undefined
          }
        />
      </ScrollView>
    </TableStage>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, gap: 10 },
  area: { flexGrow: 1, minHeight: 7 * 36 + 40, alignItems: 'center', justifyContent: 'center' },
  frame: { borderRadius: 14, backgroundColor: '#15120F' },
  scores: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  chips: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  chipCol: { alignItems: 'center', gap: 2 },
  chip: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  chipNote: { minHeight: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
