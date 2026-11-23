import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SCHEME_LABEL } from '../spaces-logic';
import { formatNaira } from '@dyce/shared';
import { Icon, MIN_TOUCH, Text, TokenButton, brand, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { iForfeited, nameResolver, partyRefusal, phaseTotalMs, seatNote } from './common-logic';
import {
  BRUSHES,
  CELLS,
  GUESS_MAX_CHARS,
  PALETTE,
  SHAPES,
  SIZES,
  canvasHasRoom,
  doodleStage,
  drawerStrokes,
  feedLines,
  lastWord,
  letterCount,
  maskCells,
  maskSpoken,
  pointsUsed,
  sameShape,
  scoreboard,
  shapePoints,
  type ShapeName,
} from './doodle-logic';
import { useDrawing } from './use-drawing';
import { usePhaseClock } from './use-now';
import { useSend } from './use-send';
import { parseDoodleView } from './views';
import type { PartyScreenProps } from './types';
import {
  CountdownRing,
  LeaveSheet,
  Notice,
  PartyBanner,
  SendRow,
  useLeaveSheet,
} from './components/PartyChrome';
import { DrawingCanvas } from './components/DrawingCanvas';
import { ResultsPanel } from './components/ResultsPanel';

const ORANGE = '#FF7A1A';

/**
 * Doodle Guess (design: DoodleRoom): the players and their points across the top, the word as blanks, the
 * drawing, the guesses scrolling by and a box to guess. The drawer picks one of three words, then draws
 * with fingers (or stamps shapes, for anyone who cannot drag) while the room streams the strokes to
 * everyone else. Guessing is an action, not chat: a close guess is shown as "is close!" without the text.
 * Follows the device theme (the canvas stays white).
 */
export function DoodleScreen(p: PartyScreenProps) {
  const { space, myId, live, status, receivedAt, errorCode, canvas } = p;
  const { colors, isDark } = useTheme();
  const view = useMemo(() => parseDoodleView(live.view), [live.view]);
  const nameOf = useMemo(() => nameResolver(space, myId), [space, myId]);
  const { seconds, now } = usePhaseClock(live, receivedAt);
  const { sending, send } = useSend(p.onMove, live.version, errorCode);
  const leave = useLeaveSheet();
  const { width, height } = useWindowDimensions();

  const [color, setColor] = useState(0);
  const [brush, setBrush] = useState(1);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [shape, setShape] = useState<ShapeName>('circle');
  const [cell, setCell] = useState(4);
  const [sizeIdx, setSizeIdx] = useState(1);
  const [fullNote, setFullNote] = useState<string | null>(null);

  const out = iForfeited(live, myId);
  const drawing =
    !!view && view.phase === 'draw' && view.drawer === myId && !out && live.status === 'live';
  const draw = useDrawing({
    enabled: drawing,
    turn: view?.turn ?? 0,
    color,
    width: BRUSHES[brush]?.width ?? 4,
    send: p.onMove,
  });

  // The drawer's picture and the room's agree within a moment; if they never do, the room's wins.
  const shown = drawing ? drawerStrokes(draw.local, canvas, draw.changedAt.current, now) : null;
  const adoptRoom = !!shown && !shown.usingLocal && !sameShape(draw.local, shown.strokes);
  const { adopt } = draw;
  const roomStrokes = shown?.strokes;
  useEffect(() => {
    if (adoptRoom && roomStrokes) adopt([...roomStrokes]);
  }, [adoptRoom, roomStrokes, adopt]);

  if (!view) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }, styles.centerAll]}>
        <Text>The table could not be read. Try again.</Text>
        <TokenButton label="Back" tone="chip" onPress={p.onBack} />
      </View>
    );
  }

  const over = live.status === 'finished' || view.phase === 'over';
  const stage = doodleStage(view, myId, nameOf);
  const isDrawer = view.drawer === myId;
  const solved = view.solvers.includes(myId);
  const canGuess = view.phase === 'draw' && !isDrawer && !solved && !out && !over;
  const board = scoreboard(view);
  const cells = maskCells(view.mask);
  const feed = feedLines(view.feed, nameOf).slice(-8);
  const previous = view.phase === 'choose' ? lastWord(view, nameOf) : null;
  const refusal = fullNote ?? partyRefusal(errorCode);
  const canvasSize = Math.round(Math.max(220, Math.min(width - 28, 372, height - 430)));
  const strokes = drawing && shown ? shown.strokes : canvas;
  const budgetLow = drawing && pointsUsed(strokes) > 3700;

  const tagText = isDrawer
    ? 'You are drawing'
    : solved
      ? 'You got it'
      : view.phase === 'draw'
        ? 'You are guessing'
        : '';

  const bubble = (tone: 'guess' | 'close' | 'correct') =>
    tone === 'close'
      ? {
          bg: isDark ? '#3A2A00' : '#FFF3D6',
          fg: isDark ? '#FFD27A' : '#7A4A00',
          w: '600' as const,
        }
      : tone === 'correct'
        ? { bg: colors.moneySoft, fg: colors.money, w: '700' as const }
        : { bg: isDark ? '#1D1916' : '#F2ECE3', fg: colors.text, w: '400' as const };

  const stampShape = () => {
    const pts = shapePoints(shape, cell, sizeIdx);
    if (!canvasHasRoom(strokes, pts.length) || !draw.stamp(pts)) {
      setFullNote('The canvas is full. Clear it to keep drawing.');
      return;
    }
    setFullNote(null);
  };

  const label = drawing
    ? 'Your drawing. Drag a finger to draw, or use Shapes.'
    : view.phase === 'draw'
      ? `${nameOf(view.drawer)} is drawing. ${view.strokeCount} strokes so far.`
      : 'The canvas is empty';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to the space"
              onPress={p.onBack}
              style={[styles.back, { backgroundColor: colors.chip }]}
            >
              <Icon name="back" size={20} color={colors.text} />
            </Pressable>
            <View style={styles.flex}>
              <Text variant="callout" numberOfLines={1} accessibilityRole="header">
                Doodle Guess · Round {view.round} of {view.rounds}
              </Text>
              <Text variant="footnote" color="accent" numberOfLines={1}>
                {space.mode === 'pool'
                  ? `Pool ${formatNaira(space.potKobo)} · ${SCHEME_LABEL[space.payoutScheme]}`
                  : 'Free space · XP'}
              </Text>
            </View>
            <CountdownRing
              seconds={over ? null : seconds}
              totalMs={phaseTotalMs('doodle-guess', view.phase, (seconds ?? 0) * 1000)}
              color={ORANGE}
              track={colors.chip}
              textColor={colors.text}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Game menu"
              onPress={leave.show}
              style={[styles.back, { backgroundColor: colors.chip }]}
            >
              <Icon name="menu" size={20} color={colors.text} />
            </Pressable>
          </View>
          <PartyBanner status={status} live={live} />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.strip}
            contentContainerStyle={styles.stripBody}
          >
            {board.map((r) => {
              const m = space.members.find((x) => x.userId === r.userId);
              const note = seatNote(live, r.userId);
              const caption = r.drawing
                ? 'Drawing'
                : r.solved
                  ? 'Got it'
                  : note === 'left'
                    ? 'Left'
                    : note === 'offline'
                      ? 'Offline'
                      : null;
              return (
                <View
                  key={r.userId}
                  accessible
                  accessibilityLabel={`${nameOf(r.userId)}, ${r.score} points${caption ? `, ${caption.toLowerCase()}` : ''}`}
                  style={[styles.player, { opacity: note === 'left' ? 0.5 : 1 }]}
                >
                  <View
                    style={[
                      styles.ring,
                      { borderColor: r.drawing ? ORANGE : r.solved ? brand.online : 'transparent' },
                    ]}
                  >
                    <UserAvatar avatar={m?.avatar} name={nameOf(r.userId)} size={40} />
                  </View>
                  <Text variant="footnote" numberOfLines={1} style={styles.pName}>
                    {nameOf(r.userId)}
                  </Text>
                  <Text variant="footnote" color={r.solved ? 'money' : 'sub'} style={styles.pPts}>
                    {r.score}
                  </Text>
                  {caption ? (
                    <Text variant="caption" color="sub">
                      {caption}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View
              style={styles.hintRow}
              accessibilityLiveRegion="polite"
              accessible
              accessibilityLabel={
                view.word && (isDrawer || solved)
                  ? `${isDrawer ? 'Your word' : 'The word'} is ${view.word}`
                  : `${stage.headline}. ${maskSpoken(view.mask)}`
              }
            >
              <Text variant="footnote" color="sub">
                {stage.headline}
              </Text>
              {cells.length > 0 && !(view.word && (isDrawer || solved)) ? (
                <>
                  <View style={styles.blanks}>
                    {cells.map((c, i) =>
                      c.space ? (
                        <View key={i} style={{ width: 10 }} />
                      ) : (
                        <View key={i} style={[styles.blank, { borderBottomColor: colors.text }]}>
                          <Text variant="headline" style={styles.blankCh}>
                            {c.ch.toUpperCase()}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                  <Text variant="footnote" color="sub">
                    {letterCount(view.mask)}
                  </Text>
                </>
              ) : null}
              {view.word && (isDrawer || solved) ? (
                <Text variant="headline" style={{ color: colors.accent }}>
                  {view.word.toUpperCase()}
                </Text>
              ) : null}
            </View>

            <View style={styles.canvasWrap}>
              <DrawingCanvas
                size={canvasSize}
                strokes={strokes}
                label={label}
                onTouch={drawing ? draw.onTouch : undefined}
              />
              {tagText ? (
                <View style={styles.canvasTag} pointerEvents="none">
                  <Text variant="caption" style={{ color: '#fff' }}>
                    {tagText}
                  </Text>
                </View>
              ) : null}
              {view.phase === 'choose' && !isDrawer ? (
                <View style={[styles.canvasMsg, { width: canvasSize }]} pointerEvents="none">
                  <Text variant="callout" style={{ color: '#6F655B', textAlign: 'center' }}>
                    {nameOf(view.drawer)} is choosing a word…
                  </Text>
                </View>
              ) : null}
            </View>
            {previous ? (
              <Text
                variant="footnote"
                color="sub"
                style={styles.previous}
                accessibilityLiveRegion="polite"
              >
                {previous}
              </Text>
            ) : null}

            {view.phase === 'choose' && isDrawer && !out ? (
              <View style={styles.choices} accessibilityLabel="Pick a word to draw">
                <Text variant="callout">Pick a word to draw</Text>
                {view.choices.map((w, i) => (
                  <TokenButton
                    key={w}
                    label={w}
                    tone={i === 0 ? 'ember' : 'chip'}
                    disabled={sending}
                    accessibilityLabel={`Draw ${w}`}
                    onPress={() => send({ kind: 'choose', index: i })}
                  />
                ))}
                <Text variant="footnote" color="sub">
                  If the clock runs out, the first word is picked for you.
                </Text>
              </View>
            ) : null}

            {drawing ? (
              <View style={styles.tools}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.swatches}
                >
                  {PALETTE.map((c, i) => (
                    <Pressable
                      key={c.name}
                      accessibilityRole="button"
                      accessibilityLabel={c.name}
                      accessibilityState={{ selected: color === i }}
                      onPress={() => setColor(i)}
                      style={styles.swatchHit}
                    >
                      <View
                        style={[
                          styles.swatch,
                          {
                            backgroundColor: c.hex,
                            borderColor: color === i ? brand.ember.fill : colors.line,
                            borderWidth: color === i ? 3 : 1.5,
                          },
                        ]}
                      />
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.toolRow}>
                  {BRUSHES.map((b, i) => (
                    <Chip
                      key={b.name}
                      label={b.name}
                      selected={brush === i}
                      onPress={() => setBrush(i)}
                      accessibilityLabel={`${b.name} brush`}
                    />
                  ))}
                  <Chip label="Undo" onPress={draw.undo} />
                  <Chip label="Clear" onPress={draw.clear} />
                  <Chip
                    label="Shapes"
                    selected={shapesOpen}
                    onPress={() => setShapesOpen((s) => !s)}
                    accessibilityLabel={
                      shapesOpen ? 'Hide shapes' : 'Show shapes: draw without dragging'
                    }
                  />
                </View>
                {budgetLow ? (
                  <Text variant="footnote" color="sub">
                    The canvas is nearly full.
                  </Text>
                ) : null}
                {shapesOpen ? (
                  <View
                    style={[
                      styles.shapes,
                      { backgroundColor: colors.card, borderColor: colors.line },
                    ]}
                  >
                    <Text variant="footnote" color="sub">
                      Pick a shape, where it goes and how big, then add it.
                    </Text>
                    <View style={styles.toolRow}>
                      {SHAPES.map((s) => (
                        <Chip
                          key={s.name}
                          label={s.label}
                          selected={shape === s.name}
                          onPress={() => setShape(s.name)}
                          accessibilityLabel={`${s.label} shape`}
                        />
                      ))}
                    </View>
                    <View style={styles.cells} accessibilityLabel="Where on the canvas">
                      {CELLS.map((c, i) => (
                        <Pressable
                          key={c}
                          accessibilityRole="button"
                          accessibilityLabel={`Place ${c}`}
                          accessibilityState={{ selected: cell === i }}
                          onPress={() => setCell(i)}
                          style={[
                            styles.cell,
                            { backgroundColor: cell === i ? brand.ember.fill : colors.chip },
                          ]}
                        >
                          <Text
                            variant="caption"
                            style={{ color: cell === i ? '#fff' : colors.sub }}
                          >
                            {i + 1}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.toolRow}>
                      {SIZES.map((s, i) => (
                        <Chip
                          key={s.name}
                          label={s.name}
                          selected={sizeIdx === i}
                          onPress={() => setSizeIdx(i)}
                          accessibilityLabel={`${s.name} size`}
                        />
                      ))}
                      <TokenButton label="Add shape" tone="ember" onPress={stampShape} />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {view.phase === 'draw' || feed.length > 0 ? (
              <View
                style={styles.feed}
                accessibilityLiveRegion="polite"
                accessibilityLabel="Guesses"
              >
                {feed.length === 0 ? (
                  <Text variant="footnote" color="sub">
                    {isDrawer ? 'Guesses show up here.' : 'No guesses yet. Be the first.'}
                  </Text>
                ) : (
                  feed.map((f) => {
                    const b = bubble(f.tone);
                    return (
                      <View key={f.key} style={[styles.bubble, { backgroundColor: b.bg }]}>
                        <Text
                          style={{
                            color: b.fg,
                            fontFamily:
                              f.tone === 'guess' ? 'Figtree_400Regular' : 'Figtree_700Bold',
                          }}
                        >
                          <Text style={{ color: b.fg, fontFamily: 'Figtree_800ExtraBold' }}>
                            {f.who}{' '}
                          </Text>
                          {f.text}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}
            <Notice text={refusal} onLight={!isDark} />
          </ScrollView>

          {canGuess ? (
            <View style={styles.guessRow}>
              <SendRow
                label="Your guess"
                placeholder="Type your guess"
                button="Guess"
                maxLength={GUESS_MAX_CHARS}
                dark={isDark}
                disabled={sending}
                onSend={(t) => p.onMove({ kind: 'guess', text: t })}
              />
            </View>
          ) : (
            <View style={styles.guessRow} accessibilityLiveRegion="polite">
              <Text variant="footnote" color="sub" style={styles.flex}>
                {out
                  ? 'You left this game.'
                  : isDrawer
                    ? view.phase === 'draw'
                      ? 'Draw it. Nobody can see the word but you.'
                      : stage.sub
                    : solved
                      ? 'You got it. Waiting for the others.'
                      : stage.sub}
              </Text>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      {over ? (
        <ResultsPanel
          space={space}
          live={live}
          myId={myId}
          nameOf={nameOf}
          title="That is the game"
          sub={`${view.rounds} ${view.rounds === 1 ? 'round' : 'rounds'} played`}
          onContinue={p.onContinue}
          story={
            <View style={styles.resultStory}>
              {board.map((r) => (
                <Text key={r.userId} variant="footnote" style={{ color: '#fff' }}>
                  {nameOf(r.userId)}: {r.score} points
                </Text>
              ))}
            </View>
          }
        />
      ) : null}
      {leave.open ? <LeaveSheet space={space} onLeave={p.onForfeit} onStay={leave.hide} /> : null}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? colors.ink : colors.chip }]}
    >
      <Text variant="footnote" style={{ color: selected ? colors.inkText : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1 },
  centerAll: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 56,
  },
  back: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  strip: { flexGrow: 0, flexShrink: 0, minHeight: 100 },
  stripBody: { gap: 10, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'flex-start' },
  player: { width: 58, alignItems: 'center', gap: 1 },
  ring: { borderWidth: 3, borderRadius: 26, padding: 1 },
  pName: { maxWidth: 58 },
  pPts: { fontFamily: 'Figtree_800ExtraBold' },
  body: { paddingBottom: 12, gap: 10 },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    minHeight: 36,
  },
  blanks: { flexDirection: 'row', gap: 6, alignItems: 'flex-end' },
  blank: {
    width: 22,
    minHeight: 30,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  blankCh: { textAlign: 'center' },
  canvasWrap: { alignItems: 'center', justifyContent: 'center' },
  canvasTag: {
    position: 'absolute',
    right: 20,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  canvasMsg: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  previous: { textAlign: 'center', paddingHorizontal: 20 },
  choices: { gap: 8, paddingHorizontal: 24 },
  tools: { gap: 8, paddingHorizontal: 14 },
  swatches: { gap: 0, alignItems: 'center' },
  swatchHit: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: { width: 30, height: 30, borderRadius: 15 },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shapes: { gap: 10, padding: 12, borderRadius: 18, borderWidth: 1 },
  cells: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 3 * (MIN_TOUCH + 6),
    gap: 6,
    alignSelf: 'center',
  },
  cell: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feed: { gap: 4, paddingHorizontal: 14, alignItems: 'flex-start' },
  bubble: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10 },
  guessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
    minHeight: 56,
  },
  resultStory: { gap: 2, paddingBottom: 6 },
});
