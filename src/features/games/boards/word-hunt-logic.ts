import { wordHuntDictionary, wordHuntWordScore, WORD_HUNT_MIN_LENGTH } from '@dyce/games';
import type { WordHuntView } from '../games-logic';

/**
 * Pure logic for the Word Hunt board: how a drag or a run of taps becomes a path, what the preview says,
 * the round clock and the lines under the board. No React in here, so it is unit tested. The server
 * decides what counts (dictionary and grid are re-checked there); this only predicts it for the screen.
 */

export const GRID = 4;
export const CELLS = GRID * GRID;

/** Cells that touch (sideways or diagonally). */
export function adjacent(a: number, b: number): boolean {
  if (a === b) return false;
  return (
    Math.abs(Math.floor(a / GRID) - Math.floor(b / GRID)) <= 1 &&
    Math.abs((a % GRID) - (b % GRID)) <= 1
  );
}

/**
 * One step of building a path (a drag crossing into a cell, or a tap): no repeats, only touching cells,
 * and going back onto the previous cell un-picks the last letter.
 */
export function extendPath(path: readonly number[], cell: number): number[] {
  const last = path[path.length - 1];
  if (last === undefined) return [cell];
  if (cell === last) return [...path];
  if (path.length >= 2 && cell === path[path.length - 2]) return path.slice(0, -1);
  if (path.includes(cell) || !adjacent(last, cell)) return [...path];
  return [...path, cell];
}

/**
 * One tap on a letter while tapping a word out: adds it when it touches the last one, takes it back when it
 * is the last one (or the one before), and starts a fresh run when it is somewhere else entirely.
 */
export function tapStep(path: readonly number[], cell: number): number[] {
  const last = path[path.length - 1];
  if (last === undefined) return [cell];
  if (cell === last) return path.slice(0, -1);
  if (path.includes(cell)) return extendPath(path, cell);
  return adjacent(last, cell) ? [...path, cell] : [cell];
}

/**
 * The cell under a point inside a square grid, or null in the gaps. Only the middle of each cell counts
 * (`reach` of the half-cell), so sliding diagonally between two letters does not clip a third one.
 */
export function cellAtPoint(x: number, y: number, size: number, reach = 0.78): number | null {
  if (size <= 0 || x < 0 || y < 0 || x >= size || y >= size) return null;
  const pitch = size / GRID;
  const col = Math.floor(x / pitch);
  const row = Math.floor(y / pitch);
  const dx = Math.abs(x - (col + 0.5) * pitch);
  const dy = Math.abs(y - (row + 0.5) * pitch);
  const half = (pitch / 2) * reach;
  return dx <= half && dy <= half ? row * GRID + col : null;
}

/** Centre of a cell in grid coordinates (for lines between letters). */
export function cellCenter(cell: number, size: number): { x: number; y: number } {
  const pitch = size / GRID;
  return { x: ((cell % GRID) + 0.5) * pitch, y: (Math.floor(cell / GRID) + 0.5) * pitch };
}

export const wordOf = (board: readonly string[], path: readonly number[]): string =>
  path.map((c) => board[c] ?? '').join('');

/** Is this a dictionary word (upper case, 3+ letters)? Same word list as the server. */
export function inDictionary(word: string): boolean {
  if (word.length < WORD_HUNT_MIN_LENGTH) return false;
  let node = wordHuntDictionary.root;
  for (const ch of word.toUpperCase()) {
    const next = node.next.get(ch);
    if (!next) return false;
    node = next;
  }
  return node.end;
}

export type PreviewKind = 'empty' | 'short' | 'unknown' | 'found' | 'word';

/** What the live preview shows for the letters picked so far. */
export function previewOf(
  word: string,
  found: readonly string[],
): { kind: PreviewKind; points: number } {
  if (word.length === 0) return { kind: 'empty', points: 0 };
  if (word.length < WORD_HUNT_MIN_LENGTH) return { kind: 'short', points: 0 };
  if (found.includes(word)) return { kind: 'found', points: 0 };
  return inDictionary(word)
    ? { kind: 'word', points: wordHuntWordScore(word.length) }
    : { kind: 'unknown', points: 0 };
}

/** Words found this round, in the order found. Adding an already-found word is a no-op. */
export function addFound(found: readonly string[], word: string): string[] {
  return found.includes(word) ? [...found] : [...found, word];
}

export const totalScore = (words: readonly string[]): number =>
  words.reduce((sum, w) => sum + wordHuntWordScore(w.length), 0);

// ---- the round clock -----------------------------------------------------------------------------

/** Milliseconds left in the round (never below 0). `startedAt` is when this device saw the round begin. */
export function remainingMs(startedAt: number, now: number, roundMs: number): number {
  return Math.max(0, roundMs - (now - startedAt));
}

/** "1:20", "0:07". */
export function formatClock(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A spoken version of the clock for a screen reader: "41 seconds left". */
export function spokenClock(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  if (s >= 60) return `${Math.floor(s / 60)} minute${s >= 120 ? 's' : ''} ${s % 60} seconds left`;
  return `${s} seconds left`;
}

/** What is saved on this device so a round survives leaving the screen (or the app). */
export type SavedRound = { startedAt: number; words: string[] };

export function parseSavedRound(raw: string | null): SavedRound | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SavedRound>;
    if (typeof v.startedAt !== 'number' || !Array.isArray(v.words)) return null;
    if (!v.words.every((w) => typeof w === 'string')) return null;
    return { startedAt: v.startedAt, words: v.words as string[] };
  } catch {
    return null;
  }
}

// ---- lines of text -------------------------------------------------------------------------------

export const cellLabel = (letter: string, cell: number, picked: number | null): string =>
  `Letter ${letter}, row ${Math.floor(cell / GRID) + 1}, column ${(cell % GRID) + 1}` +
  (picked === null ? '' : `, picked ${picked + 1}`);

/** "1 pt", "41 pts". */
export const pointsLabel = (n: number): string => `${n} ${n === 1 ? 'pt' : 'pts'}`;

/** The opponent chip: "Zainab · played · 41 pts", "Zainab · playing now", "Zainab · not started". */
export function opponentLine(view: WordHuntView, oppId: string | null, name: string): string {
  if (!oppId) return name;
  const status = view.status[oppId];
  if (status === 'done') return `${name} · played · ${pointsLabel(view.scores[oppId] ?? 0)}`;
  return status === 'playing' ? `${name} · playing now` : `${name} · hasn't played yet`;
}

/** "beat 41" under the clock, only once the opponent has a score on the board. */
export function beatLine(view: WordHuntView, oppId: string | null): string | null {
  const s = oppId ? view.scores[oppId] : null;
  return typeof s === 'number' ? `beat ${s}` : null;
}

/** Words the other player found that you did not (shown once the match is over). */
export function missedWords(mine: readonly string[], theirs: readonly string[]): string[] {
  return theirs.filter((w) => !mine.includes(w));
}
