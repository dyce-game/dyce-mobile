import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { WORD_HUNT_ROUND_MS } from '@dyce/games';
import type { MatchPlayer } from '@dyce/shared';
import { Text, TokenButton } from '@dyce/ui';
import { Gradient } from '@/components/Gradient';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { wordHuntStage, type WordHuntView } from '../games-logic';
import { WordHuntGrid } from './WordHuntGrid';
import { useWordHuntRound } from './use-word-hunt-round';
import {
  beatLine,
  formatClock,
  opponentLine,
  pointsLabel,
  previewOf,
  remainingMs,
  spokenClock,
  totalScore,
  wordOf,
  type PreviewKind,
} from './word-hunt-logic';

type Action = { kind: 'start' } | { kind: 'submit'; words: string[] };

/** The board sits on a fixed dark amber table in both themes (design: PlayWordHunt and PlayWordHuntDark). */
const INK = '#FFFFFF';
const SOFT = 'rgba(255,255,255,0.78)';
const GLASS = 'rgba(0,0,0,0.38)';
const GLASS_EDGE = 'rgba(255,255,255,0.14)';
const BRASS = '#FFD27A';

const PREVIEW_HINT: Record<PreviewKind, string> = {
  empty: 'Drag across touching letters',
  short: 'Keep going: 3 letters or more',
  unknown: 'Not in the word list',
  found: 'Already found',
  word: 'A word! Release to add it',
};

/**
 * Word Hunt as a play surface: the 4x4 grid, a live preview of the word you are tracing, the words found,
 * the clock and your score. It shows what the server's view says and sends two moves (start, submit). The
 * score you see is a prediction; the server re-checks every word and decides the winner.
 */
export function WordHuntBoard({
  matchId,
  view,
  players,
  myId,
  busy,
  onMove,
}: {
  matchId: string;
  view: WordHuntView;
  players: MatchPlayer[];
  myId: string | null;
  busy: boolean;
  onMove: (action: Action) => void;
}) {
  const stage = wordHuntStage(view, myId);
  const oppId = view.players.find((p) => p !== myId) ?? null;
  const nameOf = (id: string | null) => {
    const p = players.find((x) => x.userId === id);
    return p?.displayName || p?.username || 'Them';
  };
  const me = players.find((p) => p.userId === myId) ?? null;
  const opp = players.find((p) => p.userId === oppId) ?? null;

  const myStatus = myId ? view.status[myId] : undefined;
  const { round, ready, addWord } = useWordHuntRound(
    matchId,
    myStatus === 'playing',
    myStatus === 'done',
  );

  const oppChip = (
    <View
      accessible
      accessibilityLabel={opponentLine(view, oppId, nameOf(oppId))}
      style={[styles.chip, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}
    >
      {opp ? <UserAvatar avatar={opp.avatar} name={nameOf(oppId)} size={34} /> : null}
      <Text variant="footnote" color={INK} style={styles.chipText} numberOfLines={1}>
        {opponentLine(view, oppId, nameOf(oppId))}
      </Text>
    </View>
  );

  const myWords = myId ? view.words[myId] : null;

  return (
    <Gradient
      radius={28}
      radial={{ cx: 0.5, cy: 0.3 }}
      stops={[
        [0, '#3A2400'],
        [0.75, '#120A00'],
      ]}
      style={styles.stage}
    >
      {stage === 'playing' ? (
        ready && round ? (
          <PlayingRound
            view={view}
            oppId={oppId}
            oppChip={oppChip}
            me={me}
            round={round}
            addWord={addWord}
            busy={busy}
            onSubmit={(words) => onMove({ kind: 'submit', words })}
          />
        ) : (
          <View style={styles.loading}>
            <Text color={SOFT}>Getting your round ready…</Text>
          </View>
        )
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {oppChip}
          {stage === 'intro' ? (
            <Intro
              view={view}
              oppName={nameOf(oppId)}
              busy={busy}
              onStart={() => onMove({ kind: 'start' })}
            />
          ) : (
            <Waiting
              view={view}
              myId={myId}
              words={myWords ?? []}
              oppName={nameOf(oppId)}
              over={stage === 'over'}
            />
          )}
        </ScrollView>
      )}
    </Gradient>
  );
}

// ---- before the round -----------------------------------------------------------------------------

function Intro({
  view,
  oppName,
  busy,
  onStart,
}: {
  view: WordHuntView;
  oppName: string;
  busy: boolean;
  onStart: () => void;
}) {
  const seconds = Math.round(view.roundMs / 1000);
  return (
    <View style={styles.block}>
      <Text variant="title" color={BRASS} accessibilityRole="header" style={styles.center}>
        Word Hunt
      </Text>
      <Text color={INK} style={styles.centerText}>
        Find as many words as you can on the same grid as {oppName}. You have {seconds} seconds from
        the moment you start.
      </Text>
      <View style={[styles.rules, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}>
        <Text variant="footnote" color={SOFT}>
          • Drag across touching letters, diagonals too, or tap them one by one and press Add word.
        </Text>
        <Text variant="footnote" color={SOFT}>
          • Words need 3 or more letters. Each letter is used once per word.
        </Text>
        <Text variant="footnote" color={SOFT}>
          • 3 letters 1 pt · 4 letters 2 · 5 letters 4 · 6 letters 6 · 7 letters 9 · 8 or more 12.
        </Text>
        <Text variant="footnote" color={SOFT}>
          • Their words stay hidden until you have both played. Highest score wins.
        </Text>
      </View>
      <TokenButton
        label={busy ? 'Starting…' : `Start · ${seconds} seconds`}
        accessibilityLabel={`Start the round. You will have ${seconds} seconds.`}
        tone="ember"
        disabled={busy}
        onPress={onStart}
        style={styles.wide}
      />
      <Text variant="footnote" color={SOFT} style={styles.centerText}>
        Free play: no Dyce Cash moves. The clock cannot be paused.
      </Text>
    </View>
  );
}

// ---- after you have sent your words -------------------------------------------------------------

function Waiting({
  view,
  myId,
  words,
  oppName,
  over,
}: {
  view: WordHuntView;
  myId: string | null;
  words: string[];
  oppName: string;
  over: boolean;
}) {
  const score = (myId ? view.scores[myId] : null) ?? 0;
  const oppId = view.players.find((p) => p !== myId) ?? null;
  const oppScore = oppId ? view.scores[oppId] : null;
  return (
    <View style={styles.block} accessibilityLiveRegion="polite">
      <Text variant="title" color={BRASS} accessibilityRole="header" style={styles.center}>
        {over ? 'All done' : 'Your round is in'}
      </Text>
      <Text variant="display" color={INK} style={styles.center}>
        {pointsLabel(score)}
      </Text>
      <Text color={INK} style={styles.centerText}>
        {words.length === 1 ? '1 word' : `${words.length} words`} counted
        {view.possibleWords !== null ? ` of ${view.possibleWords} on this grid` : ''}.
        {view.rejected ? ` ${view.rejected} didn't count.` : ''}
      </Text>
      {typeof oppScore === 'number' ? (
        <Text variant="callout" color={BRASS} style={styles.center}>
          {oppName} scored {oppScore}
        </Text>
      ) : null}
      <WordChips words={words} />
      {!over ? (
        <Text variant="footnote" color={SOFT} style={styles.centerText}>
          Waiting for {oppName} to play. You will see their words when they finish.
        </Text>
      ) : null}
    </View>
  );
}

export function WordChips({ words, muted }: { words: readonly string[]; muted?: boolean }) {
  if (words.length === 0) {
    return (
      <Text variant="footnote" color={SOFT} style={styles.center}>
        No words yet
      </Text>
    );
  }
  return (
    <View style={styles.chips} accessibilityLabel={`Words: ${words.join(', ')}`} accessible>
      {words.map((w) => (
        <View key={w} style={[styles.word, muted ? styles.wordMuted : null]}>
          <Text variant="caption" color={INK} style={styles.wordText}>
            {w}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---- the round itself --------------------------------------------------------------------------------

function PlayingRound({
  view,
  oppId,
  oppChip,
  me,
  round,
  addWord,
  busy,
  onSubmit,
}: {
  view: WordHuntView;
  oppId: string | null;
  oppChip: React.ReactNode;
  me: MatchPlayer | null;
  round: { startedAt: number; words: string[] };
  addWord: (word: string) => void;
  busy: boolean;
  onSubmit: (words: string[]) => void;
}) {
  const { width, height } = useWindowDimensions();
  const letters = view.board ?? [];
  const found = round.words;
  const [path, setPath] = useState<number[]>([]);
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);

  // Square grid: as big as the phone allows, never under 220pt (a 47pt tile, above the 44pt minimum).
  const size = Math.max(220, Math.min(340, width - 64, height - 520));

  const word = wordOf(letters, path);
  const preview = previewOf(word, found);
  const tone =
    preview.kind === 'word'
      ? 'word'
      : preview.kind === 'found'
        ? 'found'
        : preview.kind === 'unknown'
          ? 'unknown'
          : 'plain';

  function tryPath(cells: number[]) {
    const w = wordOf(letters, cells);
    const p = previewOf(w, found);
    if (p.kind === 'word') {
      addWord(w);
      setFlash({ text: `${w} +${p.points}`, good: true });
    } else {
      setFlash({
        text:
          p.kind === 'found'
            ? `${w}: already found`
            : p.kind === 'short'
              ? 'Too short'
              : `${w}: not a word`,
        good: false,
      });
    }
    setPath([]);
  }

  function changePath(next: number[]) {
    setFlash(null);
    setPath(next);
  }

  const hint = flash?.text ?? PREVIEW_HINT[preview.kind];

  return (
    <View style={styles.playing}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {oppChip}

        <View style={styles.previewBox} accessibilityLiveRegion="polite">
          <Text
            variant="display"
            color={BRASS}
            numberOfLines={1}
            accessibilityLabel={word ? `Picked: ${word.split('').join(' ')}` : 'No letters picked'}
            style={[styles.preview, { textShadowColor: '#A86F12' }]}
          >
            {word || ' '}
          </Text>
          <Text
            variant="footnote"
            color={flash ? (flash.good ? '#7BE3A8' : '#FFB59E') : SOFT}
            style={styles.center}
          >
            {preview.kind === 'word' && !flash
              ? `+${preview.points} · release, or press Add word`
              : hint}
          </Text>
        </View>

        <View style={styles.frame}>
          <WordHuntGrid
            letters={letters}
            path={path}
            tone={tone}
            size={size}
            disabled={busy}
            onPathChange={changePath}
            onCommit={tryPath}
          />
        </View>

        <View style={styles.actions}>
          <TokenButton
            label="Add word"
            accessibilityLabel={word ? `Add the word ${word}` : 'Add word. Pick letters first.'}
            tone="felt"
            disabled={path.length < 3 || busy}
            onPress={() => tryPath(path)}
            style={styles.action}
          />
          <TokenButton
            label="Clear"
            accessibilityLabel="Clear the picked letters"
            tone="chip"
            disabled={path.length === 0}
            onPress={() => changePath([])}
            style={styles.action}
          />
        </View>

        <View style={styles.foundBox}>
          <Text variant="caption" color={SOFT} style={styles.center}>
            {found.length === 1 ? '1 word found' : `${found.length} words found`}
          </Text>
          <WordChips words={found} />
        </View>
      </ScrollView>

      <RoundBar
        me={me}
        found={found}
        startedAt={round.startedAt}
        roundMs={view.roundMs || WORD_HUNT_ROUND_MS}
        beat={beatLine(view, oppId)}
        busy={busy}
        onSubmit={onSubmit}
      />
    </View>
  );
}

/** The clock, your score and Done. Owns the timer so the grid does not redraw four times a second. */
function RoundBar({
  me,
  found,
  startedAt,
  roundMs,
  beat,
  busy,
  onSubmit,
}: {
  me: MatchPlayer | null;
  found: string[];
  startedAt: number;
  roundMs: number;
  beat: string | null;
  busy: boolean;
  onSubmit: (words: string[]) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = remainingMs(startedAt, now, roundMs);
  const over = left <= 0;
  const score = totalScore(found);

  // Time is up: send what we have, once. If that fails the button below sends it again.
  const auto = useRef(false);
  const latest = useRef({ found, onSubmit });
  latest.current = { found, onSubmit };
  useEffect(() => {
    if (over && !busy && !auto.current) {
      auto.current = true;
      latest.current.onSubmit(latest.current.found);
    }
  }, [over, busy]);

  // Read the time out only at the marks, not every tick.
  const mark = left > 0 && (left <= 10_000 || Math.ceil(left / 1000) % 20 === 0);

  return (
    <View style={[styles.bar, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}>
      <View style={styles.track} aria-hidden>
        <View style={[styles.fill, { width: `${Math.min(100, (left / roundMs) * 100)}%` }]} />
      </View>
      <View style={styles.barRow}>
        {me ? (
          <UserAvatar avatar={me.avatar} name={me.displayName || me.username} size={42} />
        ) : null}
        <View style={styles.flex}>
          <Text variant="callout" color={INK} numberOfLines={1}>
            Your round · {pointsLabel(score)}
          </Text>
          <Text
            variant="footnote"
            color={left <= 10_000 ? '#FFB59E' : SOFT}
            accessibilityLabel={over ? "Time's up" : spokenClock(left)}
            accessibilityLiveRegion={mark ? 'polite' : 'none'}
          >
            {over ? "Time's up" : `${formatClock(left)} left`}
            {beat ? ` · ${beat}` : ''}
          </Text>
        </View>
        <TokenButton
          label={busy ? 'Sending…' : over ? 'Send words' : 'Done'}
          accessibilityLabel={over ? 'Send my words' : 'Finish my round and send my words'}
          tone="brass"
          disabled={busy}
          onPress={() => onSubmit(found)}
          style={styles.done}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, margin: 12, marginTop: 8 },
  playing: { flex: 1 },
  scroll: { alignItems: 'center', gap: 14, padding: 16, paddingBottom: 20 },
  center: { textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  flex: { flex: 1 },
  block: { alignItems: 'center', gap: 14, width: '100%', maxWidth: 420 },
  wide: { alignSelf: 'stretch' },
  rules: { alignSelf: 'stretch', gap: 6, padding: 14, borderRadius: 18, borderWidth: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: 23,
    borderWidth: 1,
    maxWidth: '100%',
  },
  chipText: { flexShrink: 1 },
  previewBox: { alignItems: 'center', minHeight: 72, justifyContent: 'center', gap: 2 },
  preview: { letterSpacing: 4, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  frame: {
    padding: 14,
    borderRadius: 26,
    backgroundColor: '#E3A93B',
    boxShadow: '0px 10px 0px #7A4A00',
  },
  actions: { flexDirection: 'row', gap: 12, alignSelf: 'stretch', maxWidth: 360, marginTop: 6 },
  action: { flex: 1 },
  foundBox: { alignSelf: 'stretch', gap: 8, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  word: {
    minHeight: 28,
    paddingHorizontal: 11,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordMuted: { backgroundColor: 'rgba(255,255,255,0.08)' },
  wordText: { textTransform: 'none', letterSpacing: 0.6 },
  bar: { margin: 10, marginTop: 0, padding: 10, borderRadius: 30, borderWidth: 1, gap: 8 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginHorizontal: 6,
  },
  fill: { height: 4, borderRadius: 2, backgroundColor: '#E3A93B' },
  done: { minWidth: 96 },
});
