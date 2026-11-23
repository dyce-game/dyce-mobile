import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ANAGRAMS_LETTERS, anagramsWordScore } from '@dyce/games';
import type { MatchPlayer } from '@dyce/shared';
import { Icon, Text, TokenButton } from '@dyce/ui';
import { Gradient } from '@/components/Gradient';
import type { BoardProps } from '../registry/types';
import {
  BottomBar,
  BRASS,
  GLASS,
  GLASS_EDGE,
  GOOD,
  INK,
  PlayerChip,
  SOFT,
  WARN,
} from './arcade-kit';
import { playerName } from './arcade-parse';
import {
  anagramsStage,
  beatLine,
  byPoints,
  dropLast,
  letterLabel,
  opponentLine,
  pickedWord,
  pickForLetter,
  poolLabel,
  pointsLabel,
  previewHint,
  previewOf,
  shuffledOrder,
  togglePick,
  totalScore,
  type AnagramsView,
} from './anagrams-logic';
import { useWordHuntRound } from './use-word-hunt-round';
import { formatClock, remainingMs, spokenClock } from './word-hunt-logic';

/** The table is a fixed dark walnut panel in both themes (design: PlayAnagrams and PlayAnagramsDark). */
const TILE = { fill: '#FBF1DD', edge: '#B9A57E', text: '#3A2A14' } as const;
const TILE_USED = { fill: '#6B4A2A', edge: '#4A3018', text: 'rgba(255,255,255,0.28)' } as const;
const SLOT_GAP = 8;

/**
 * Anagrams as a play surface: six seeded letters, a 60 second round that starts when you press Start, a word
 * built by tapping letters (or typing, on the web), a live preview, your words so far and the clock. Both
 * players play at once on their own time. It shows what the server's view says and sends two moves (start,
 * submit). The server re-checks every word and enforces the clock (a late submit counts as empty); the score
 * you see is a prediction.
 */
export function AnagramsBoard({
  matchId,
  view,
  players,
  myId,
  busy,
  onMove,
}: BoardProps<AnagramsView>) {
  const stage = anagramsStage(view, myId);
  const oppId = view.players.find((p) => p !== myId) ?? null;
  const oppName = playerName(players, oppId);
  const me = players.find((p) => p.userId === myId) ?? null;
  const opp = players.find((p) => p.userId === oppId) ?? null;
  const myStatus = myId ? view.status[myId] : undefined;
  const { round, ready, addWord } = useWordHuntRound(
    matchId,
    myStatus === 'playing',
    myStatus === 'done',
  );
  const chip = <PlayerChip player={opp} name={oppName} line={opponentLine(view, oppId, oppName)} />;

  return (
    <Gradient
      radius={28}
      radial={{ cx: 0.5, cy: 0.3 }}
      stops={[
        [0, '#3A2416'],
        [0.75, '#120A06'],
      ]}
      style={styles.stage}
    >
      {stage === 'playing' ? (
        ready && round && view.letters ? (
          <Round
            view={view}
            letters={view.letters}
            oppId={oppId}
            chip={chip}
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
          {chip}
          {stage === 'intro' ? (
            <Intro
              seconds={Math.round(view.roundMs / 1000)}
              oppName={oppName}
              busy={busy}
              onStart={() => onMove({ kind: 'start' })}
            />
          ) : (
            <Waiting
              view={view}
              myId={myId}
              oppId={oppId}
              oppName={oppName}
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
  seconds,
  oppName,
  busy,
  onStart,
}: {
  seconds: number;
  oppName: string;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <View style={styles.block}>
      <Text variant="title" color={BRASS} accessibilityRole="header" style={styles.center}>
        Anagrams
      </Text>
      <Text color={INK} style={styles.center}>
        Six letters, the same six for you and {oppName}. Make as many words as you can in {seconds}{' '}
        seconds from the moment you start.
      </Text>
      <View style={[styles.rules, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}>
        <Text variant="footnote" color={SOFT}>
          • Tap letters to build a word, then press Enter. On a keyboard, just type.
        </Text>
        <Text variant="footnote" color={SOFT}>
          • Words are 3 to 6 letters, each letter used once.
        </Text>
        <Text variant="footnote" color={SOFT}>
          • 3 letters 1 pt · 4 letters 2 · 5 letters 4 · all six letters 10.
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
      <Text variant="footnote" color={SOFT} style={styles.center}>
        Free play: no Dyce Cash moves. The clock cannot be paused.
      </Text>
    </View>
  );
}

// ---- after you have sent your words -------------------------------------------------------------

function Waiting({
  view,
  myId,
  oppId,
  oppName,
  over,
}: {
  view: AnagramsView;
  myId: string | null;
  oppId: string | null;
  oppName: string;
  over: boolean;
}) {
  const score = (myId ? view.scores[myId] : null) ?? 0;
  const words = (myId ? view.words[myId] : null) ?? [];
  const oppScore = oppId ? view.scores[oppId] : null;
  return (
    <View style={styles.block} accessibilityLiveRegion="polite">
      <Text variant="title" color={BRASS} accessibilityRole="header" style={styles.center}>
        {over ? 'All done' : 'Your round is in'}
      </Text>
      <Text variant="display" color={INK} style={styles.center}>
        {pointsLabel(score)}
      </Text>
      <Text color={INK} style={styles.center}>
        {words.length === 1 ? '1 word' : `${words.length} words`} counted
        {view.possibleWords !== null ? ` of ${view.possibleWords} possible` : ''}.
        {view.rejected ? ` ${view.rejected} didn't count.` : ''}
      </Text>
      {typeof oppScore === 'number' ? (
        <Text variant="callout" color={BRASS} style={styles.center}>
          {oppName} scored {oppScore}
        </Text>
      ) : null}
      <WordChips words={words} />
      {!over ? (
        <Text variant="footnote" color={SOFT} style={styles.center}>
          Waiting for {oppName} to play. You will see their words when they finish.
        </Text>
      ) : null}
    </View>
  );
}

function WordChips({ words }: { words: readonly string[] }) {
  if (words.length === 0) {
    return (
      <Text variant="footnote" color={SOFT} style={styles.center}>
        No words yet
      </Text>
    );
  }
  return (
    <View style={styles.chips} accessible accessibilityLabel={`Words: ${words.join(', ')}`}>
      {byPoints(words).map((w) => (
        <View key={w} style={styles.word}>
          <Text variant="caption" color={INK} style={styles.wordText}>
            {w} · {anagramsWordScore(w.length)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---- the round itself --------------------------------------------------------------------------------

function Round({
  view,
  letters,
  oppId,
  chip,
  me,
  round,
  addWord,
  busy,
  onSubmit,
}: {
  view: AnagramsView;
  letters: string[];
  oppId: string | null;
  chip: React.ReactNode;
  me: MatchPlayer | null;
  round: { startedAt: number; words: string[] };
  addWord: (word: string) => void;
  busy: boolean;
  onSubmit: (words: string[]) => void;
}) {
  const { width } = useWindowDimensions();
  const found = round.words;
  const [picks, setPicks] = useState<number[]>([]);
  const [order, setOrder] = useState<number[]>(() => letters.map((_, i) => i));
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);
  const [expired, setExpired] = useState(false);

  const count = Math.max(letters.length, ANAGRAMS_LETTERS);
  const tile = Math.max(
    40,
    Math.min(50, Math.floor((width - 56 - SLOT_GAP * (count - 1)) / count)),
  );
  const tileH = Math.round(tile * 1.12);

  const word = pickedWord(letters, picks);
  const preview = previewOf(word, found);

  const change = useCallback((next: number[]) => {
    setFlash(null);
    setPicks(next);
  }, []);

  const enter = useCallback(() => {
    if (expired) return;
    const w = pickedWord(letters, picks);
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
              : p.kind === 'unknown'
                ? `${w}: not in the word list`
                : 'Pick some letters first',
        good: false,
      });
    }
    setPicks([]);
  }, [addWord, expired, found, letters, picks]);

  // The keyboard, on the web: type letters, Backspace takes one back, Enter adds the word.
  const latest = useRef({ picks, enter, expired });
  latest.current = { picks, enter, expired };
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || latest.current.expired) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        latest.current.enter();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        change(dropLast(latest.current.picks));
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        const i = pickForLetter(letters, latest.current.picks, e.key);
        if (i !== null) change([...latest.current.picks, i]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [change, letters]);

  // Time is up: send what we have, once. If that fails the button below sends it again.
  const auto = useRef(false);
  const live = useRef({ found, onSubmit });
  live.current = { found, onSubmit };
  useEffect(() => {
    if (expired && !busy && !auto.current) {
      auto.current = true;
      live.current.onSubmit(live.current.found);
    }
  }, [expired, busy]);

  const score = totalScore(found);
  const hint = flash?.text ?? previewHint(preview.kind, preview.points);
  const hintColor = flash ? (flash.good ? GOOD : WARN) : preview.kind === 'word' ? GOOD : SOFT;
  const beat = beatLine(view, oppId);

  return (
    <View style={styles.playing}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {chip}

        <ClockRing
          startedAt={round.startedAt}
          roundMs={view.roundMs}
          onExpire={() => setExpired(true)}
        />

        <View
          style={styles.slots}
          accessible
          accessibilityLabel={
            word ? `Word so far: ${word.split('').join(' ')}` : 'No letters picked'
          }
          accessibilityLiveRegion="polite"
        >
          {Array.from({ length: count }, (_, i) => {
            const ch = word[i] ?? '';
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={ch ? `Take back ${ch}` : `Empty slot ${i + 1}`}
                disabled={!ch || busy || expired}
                onPress={() => change(picks.filter((_, k) => k !== i))}
                style={[
                  styles.tile,
                  { width: tile, height: tileH },
                  ch
                    ? { backgroundColor: TILE.fill, boxShadow: `0px 5px 0px ${TILE.edge}` }
                    : styles.slotEmpty,
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.letter, { fontSize: tile * 0.56, color: TILE.text }]}
                >
                  {ch}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text
          variant="footnote"
          color={hintColor}
          style={[styles.center, styles.hint]}
          accessibilityLiveRegion="polite"
        >
          {hint}
        </Text>

        <View style={styles.tray} accessibilityLabel={poolLabel(letters, picks)}>
          <View style={styles.poolRow}>
            {order.map((idx) => {
              const used = picks.includes(idx);
              const pal = used ? TILE_USED : TILE;
              return (
                <Pressable
                  key={idx}
                  accessibilityRole="button"
                  accessibilityLabel={letterLabel(letters[idx] ?? '', used)}
                  accessibilityState={{ selected: used, disabled: busy || expired }}
                  disabled={busy || expired}
                  onPress={() => change(togglePick(picks, idx))}
                  style={[
                    styles.tile,
                    {
                      width: tile,
                      height: tileH,
                      backgroundColor: pal.fill,
                      boxShadow: used ? 'none' : `0px 6px 0px ${pal.edge}`,
                    },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.letter, { fontSize: tile * 0.56, color: pal.text }]}
                  >
                    {letters[idx]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Shuffle the letters"
            onPress={() => setOrder(shuffledOrder(letters.length, Math.random))}
            style={[styles.ghost, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}
          >
            <Icon name="shuffle" color={INK} size={20} />
            <Text variant="callout" color={INK}>
              Shuffle
            </Text>
          </Pressable>
          <TokenButton
            label="Clear"
            accessibilityLabel="Clear the picked letters"
            tone="chip"
            disabled={picks.length === 0 || busy}
            onPress={() => change([])}
            style={styles.action}
          />
          <TokenButton
            label="Enter"
            accessibilityLabel={word ? `Add the word ${word}` : 'Add word. Pick letters first.'}
            tone="felt"
            disabled={picks.length < 3 || busy || expired}
            onPress={enter}
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

      <BottomBar
        me={me}
        title={`${pointsLabel(score)} · ${found.length} ${found.length === 1 ? 'word' : 'words'}`}
        subtitle={beat ? `Your round · ${beat}` : 'Your round'}
        style={styles.bar}
      >
        <TokenButton
          label={busy ? 'Sending…' : expired ? 'Send words' : 'Done'}
          accessibilityLabel={expired ? 'Send my words' : 'Finish my round and send my words'}
          tone="brass"
          disabled={busy}
          onPress={() => onSubmit(found)}
          style={styles.done}
        />
      </BottomBar>
    </View>
  );
}

/** The round clock as a ring. It owns the timer so the tiles do not redraw four times a second. */
function ClockRing({
  startedAt,
  roundMs,
  onExpire,
}: {
  startedAt: number;
  roundMs: number;
  onExpire: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = remainingMs(startedAt, now, roundMs);
  const over = left <= 0;
  const fired = useRef(false);
  useEffect(() => {
    if (over && !fired.current) {
      fired.current = true;
      onExpire();
    }
  }, [over, onExpire]);

  const size = 92;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, left / roundMs));
  const low = left <= 10_000;
  const mark = left > 0 && (left <= 10_000 || Math.ceil(left / 1000) % 20 === 0);

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={over ? "Time's up" : spokenClock(left)}
      accessibilityLiveRegion={mark ? 'polite' : 'none'}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={low ? '#FF8F6B' : '#E3A93B'}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - frac)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringText} pointerEvents="none">
        <Text variant="headline" color={low ? WARN : INK}>
          {over ? '0:00' : formatClock(left)}
        </Text>
        <Text variant="caption" color={SOFT}>
          {over ? "Time's up" : 'left'}
        </Text>
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
  block: { alignItems: 'center', gap: 14, width: '100%', maxWidth: 420 },
  wide: { alignSelf: 'stretch' },
  rules: { alignSelf: 'stretch', gap: 6, padding: 14, borderRadius: 18, borderWidth: 1 },
  ringText: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slots: { flexDirection: 'row', gap: SLOT_GAP, justifyContent: 'center' },
  tile: { borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  slotEmpty: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  letter: { fontFamily: 'BricolageGrotesque_800ExtraBold' },
  hint: { minHeight: 20 },
  tray: {
    alignSelf: 'stretch',
    paddingVertical: 22,
    borderRadius: 24,
    backgroundColor: '#6B4220',
    boxShadow: '0px 10px 0px #3A200C',
    alignItems: 'center',
  },
  poolRow: { flexDirection: 'row', gap: SLOT_GAP, justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', maxWidth: 400, marginTop: 6 },
  action: { flex: 1 },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 25,
    borderWidth: 1,
  },
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
  wordText: { textTransform: 'none', letterSpacing: 0.6 },
  bar: { margin: 10, marginTop: 0 },
  done: { minWidth: 96 },
});
