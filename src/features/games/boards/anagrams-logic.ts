import { anagramsDictionary, anagramsWordScore, ANAGRAMS_MIN_LENGTH } from '@dyce/games';
import { isRec, isStr, nullableNumberRecord, strArray } from './arcade-parse';

/**
 * Pure logic for the Anagrams board: the parser for the server's view, who is to move, the word being built
 * from the six letters, the live preview, the clock helpers and the lines of text. No React in here, so it
 * is unit tested. The server decides what counts (it re-checks every word against the letters and the
 * dictionary and applies the clock rule); this only predicts it for the screen.
 */

export type AnagramsStatus = 'idle' | 'playing' | 'done';

export type AnagramsView = {
  players: string[];
  roundMs: number;
  /** The six letters; null until you press Start. */
  letters: string[] | null;
  status: Record<string, AnagramsStatus>;
  /** A score shows once that player is done. */
  scores: Record<string, number | null>;
  /** Your own words once you are done; theirs once you are both done. */
  words: Record<string, string[] | null>;
  /** How many of your words did not count (yours only, once done). */
  rejected: number | null;
  possibleWords: number | null;
  possibleScore: number | null;
};

export function parseAnagramsView(view: unknown): AnagramsView | null {
  if (!isRec(view)) return null;
  const {
    players,
    roundMs,
    letters,
    status,
    scores,
    words,
    rejected,
    possibleWords,
    possibleScore,
  } = view;
  const ids = strArray(players);
  if (!ids || typeof roundMs !== 'number' || !isRec(status) || !isRec(words)) return null;
  let outLetters: string[] | null = null;
  if (letters !== null) {
    const l = strArray(letters);
    if (!l || l.length === 0) return null;
    outLetters = l;
  }
  const outStatus: Record<string, AnagramsStatus> = {};
  const outWords: Record<string, string[] | null> = {};
  for (const id of ids) {
    const st = status[id];
    if (st !== 'idle' && st !== 'playing' && st !== 'done') return null;
    outStatus[id] = st;
    const w = words[id];
    outWords[id] = Array.isArray(w) && w.every(isStr) ? (w as string[]) : null;
  }
  const outScores = nullableNumberRecord(scores, ids);
  if (!outScores) return null;
  return {
    players: ids,
    roundMs,
    letters: outLetters,
    status: outStatus,
    scores: outScores,
    words: outWords,
    rejected: typeof rejected === 'number' ? rejected : null,
    possibleWords: typeof possibleWords === 'number' ? possibleWords : null,
    possibleScore: typeof possibleScore === 'number' ? possibleScore : null,
  };
}

export type AnagramsStage = 'intro' | 'playing' | 'waiting' | 'over';

export function anagramsStage(view: AnagramsView, myId: string | null): AnagramsStage {
  const mine = myId ? view.status[myId] : undefined;
  if (mine === 'playing') return 'playing';
  if (mine === 'done') {
    return view.players.every((p) => view.status[p] === 'done') ? 'over' : 'waiting';
  }
  return 'intro';
}

/** Everyone plays at once: it is your move until you have sent your words (the chat card uses this). */
export function anagramsMover(view: AnagramsView, myId: string | null): string | null {
  if (myId && view.status[myId] !== 'done') return myId;
  return view.players.find((p) => p !== myId && view.status[p] !== 'done') ?? null;
}

/** "You 12 · Zainab 9" for the line under the result. */
export function anagramsScoreLine(
  view: AnagramsView,
  myId: string | null,
  nameOf: (id: string) => string,
): string {
  const order = [...view.players].sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0));
  return order
    .map((id) => `${id === myId ? 'You' : nameOf(id)} ${view.scores[id] ?? 0}`)
    .join(' · ');
}

// ---- building a word from the six letters --------------------------------------------------------------

/** The letters picked so far, in order. `picks` are positions in `letters`. */
export const pickedWord = (letters: readonly string[], picks: readonly number[]): string =>
  picks.map((i) => letters[i] ?? '').join('');

/** Tap a letter in the pool: pick it, or (when it is already picked) take it back along with nothing else. */
export function togglePick(picks: readonly number[], index: number): number[] {
  return picks.includes(index) ? picks.filter((p) => p !== index) : [...picks, index];
}

/** Take back the last letter. */
export const dropLast = (picks: readonly number[]): number[] => picks.slice(0, -1);

/**
 * A typed letter (the keyboard on the web): the first copy of it in the pool that is not picked yet, or
 * null when there is none left.
 */
export function pickForLetter(
  letters: readonly string[],
  picks: readonly number[],
  ch: string,
): number | null {
  const up = ch.toUpperCase();
  for (let i = 0; i < letters.length; i++) {
    if (letters[i] === up && !picks.includes(i)) return i;
  }
  return null;
}

export type PreviewKind = 'empty' | 'short' | 'unknown' | 'found' | 'word';

/** Is this a dictionary word that the six letters can make? (Always spellable when built from picks.) */
export const inAnagramsDictionary = (word: string): boolean =>
  word.length >= ANAGRAMS_MIN_LENGTH && anagramsDictionary.words.has(word.toUpperCase());

/** What the live preview says about the word being built. */
export function previewOf(
  word: string,
  found: readonly string[],
): { kind: PreviewKind; points: number } {
  if (word.length === 0) return { kind: 'empty', points: 0 };
  if (word.length < ANAGRAMS_MIN_LENGTH) return { kind: 'short', points: 0 };
  if (found.includes(word)) return { kind: 'found', points: 0 };
  return inAnagramsDictionary(word)
    ? { kind: 'word', points: anagramsWordScore(word.length) }
    : { kind: 'unknown', points: 0 };
}

export const addFound = (found: readonly string[], word: string): string[] =>
  found.includes(word) ? [...found] : [...found, word];

export const totalScore = (words: readonly string[]): number =>
  words.reduce((sum, w) => sum + anagramsWordScore(w.length), 0);

/** Your found words, best first (more points, then A to Z) for the list under the tray. */
export function byPoints(words: readonly string[]): string[] {
  return [...words].sort(
    (a, b) =>
      anagramsWordScore(b.length) - anagramsWordScore(a.length) || (a < b ? -1 : a > b ? 1 : 0),
  );
}

/** A new order for the pool tiles (Fisher-Yates); `rand` returns a number in [0, 1). Never returns the same order. */
export function shuffledOrder(n: number, rand: () => number): number[] {
  const identity = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return identity;
  for (let attempt = 0; attempt < 6; attempt++) {
    const order = [...identity];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(rand() * (i + 1)));
      [order[i], order[j]] = [order[j] as number, order[i] as number];
    }
    if (order.some((v, i) => v !== identity[i])) return order;
  }
  return [...identity.slice(1), identity[0] as number];
}

// ---- lines of text ------------------------------------------------------------------------------------

export const pointsLabel = (n: number): string => `${n} ${n === 1 ? 'pt' : 'pts'}`;

/** "Zainab · played · 12 pts", "Zainab · playing now", "Zainab · hasn't played yet". */
export function opponentLine(view: AnagramsView, oppId: string | null, name: string): string {
  if (!oppId) return name;
  const status = view.status[oppId];
  if (status === 'done') return `${name} · played · ${pointsLabel(view.scores[oppId] ?? 0)}`;
  return status === 'playing' ? `${name} · playing now` : `${name} · hasn't played yet`;
}

/** "beat 12" next to the clock, once the opponent has a score on the board. */
export function beatLine(view: AnagramsView, oppId: string | null): string | null {
  const s = oppId ? view.scores[oppId] : null;
  return typeof s === 'number' ? `beat ${s}` : null;
}

/** A spoken description of the pool for a screen reader. */
export const poolLabel = (letters: readonly string[], picks: readonly number[]): string =>
  `Letters: ${letters.join(', ')}.${picks.length ? ` Picked so far: ${pickedWord(letters, picks).split('').join(' ')}.` : ''}`;

/** The letter-tile label: "Letter G", "Letter G, used". */
export const letterLabel = (letter: string, used: boolean): string =>
  used ? `Letter ${letter}, used. Tap to take it back.` : `Letter ${letter}. Tap to add it.`;

/** Words the other player found that you did not (shown once the match is over). */
export const missedWords = (mine: readonly string[], theirs: readonly string[]): string[] =>
  theirs.filter((w) => !mine.includes(w));

/** The preview line under the word slots. */
export function previewHint(kind: PreviewKind, points: number): string {
  switch (kind) {
    case 'empty':
      return 'Tap letters to build a word';
    case 'short':
      return 'Keep going: 3 letters or more';
    case 'unknown':
      return 'Not in the word list';
    case 'found':
      return 'Already found';
    case 'word':
      return points >= 10
        ? `All six letters! +${points} · press Enter`
        : `A word! +${points} · press Enter`;
  }
}
