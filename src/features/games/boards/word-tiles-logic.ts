import {
  WORD_TILES_BOARD_SIZE,
  WORD_TILES_CENTER,
  WORD_TILES_LETTER_VALUES,
  WORD_TILES_PREMIUMS,
  WORD_TILES_RACK_SIZE,
  wordTilesAnalysePlay,
  type WordTilesPremium,
  type WordTilesTile,
} from '@dyce/games';
import { isInt, isRec, isStr, numberRecord, strArray, type Rec } from './arcade-parse';

/**
 * Pure logic for the Word Tiles board: the parser for the server's view, the tiles you have put down this
 * turn (pending, not sent), the live score preview with the engine's own rules and scoring, the rack order,
 * the board zoom and the lines of text. No React in here, so it is unit tested. The server re-validates the
 * play with its dictionary and decides; the preview here only predicts it.
 */

export const SIZE = WORD_TILES_BOARD_SIZE;
export const RACK_SIZE = WORD_TILES_RACK_SIZE;

export type WordTilesMoveView = {
  seq: number;
  by: string;
  kind: 'play' | 'exchange' | 'pass';
  score: number;
  words: { word: string; score: number }[];
  tiles: WordTilesTile[];
  exchanged: number;
  bingo: boolean;
};

export type WordTilesView = {
  players: string[];
  /** 225 cells row by row: '' empty, 'A' a tile, 'a' a blank standing for A. */
  board: string[];
  scores: Record<string, number>;
  /** Whose turn; null when the game is over. */
  turn: string | null;
  bagCount: number;
  rackCounts: Record<string, number>;
  /** Your own rack ('?' = blank); null for a spectator. */
  rack: string[] | null;
  /** Everyone's racks, once the game is over. */
  racks: Record<string, string[]> | null;
  scoreless: number;
  over: boolean;
  endReason: 'out' | 'passes' | null;
  wentOut: string | null;
  last: WordTilesMoveView | null;
};

function parseTile(v: unknown): WordTilesTile | null {
  if (!isRec(v)) return null;
  const { r, c, letter, blank } = v;
  if (!isInt(r) || !isInt(c) || r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
  if (!isStr(letter) || !/^[A-Z]$/.test(letter)) return null;
  return blank === true ? { r, c, letter, blank: true } : { r, c, letter };
}

function parseMove(v: unknown): WordTilesMoveView | null {
  if (!isRec(v)) return null;
  const { seq, by, kind, score, words, tiles, exchanged, bingo } = v;
  if (!isInt(seq) || !isStr(by) || !isInt(score) || !isInt(exchanged)) return null;
  if (kind !== 'play' && kind !== 'exchange' && kind !== 'pass') return null;
  if (!Array.isArray(words) || !Array.isArray(tiles)) return null;
  const outWords: { word: string; score: number }[] = [];
  for (const w of words) {
    if (!isRec(w) || !isStr(w.word) || !isInt(w.score)) return null;
    outWords.push({ word: w.word, score: w.score });
  }
  const outTiles: WordTilesTile[] = [];
  for (const t of tiles) {
    const p = parseTile(t);
    if (!p) return null;
    outTiles.push(p);
  }
  return {
    seq,
    by,
    kind,
    score,
    words: outWords,
    tiles: outTiles,
    exchanged,
    bingo: bingo === true,
  };
}

export function parseWordTilesView(view: unknown): WordTilesView | null {
  if (!isRec(view)) return null;
  const v: Rec = view;
  const players = strArray(v.players);
  if (!players || players.length < 2) return null;
  const board = strArray(v.board);
  if (!board || board.length !== SIZE * SIZE || !board.every((c) => /^[A-Za-z]?$/.test(c))) {
    return null;
  }
  const scores = numberRecord(v.scores, players);
  const rackCounts = numberRecord(v.rackCounts, players);
  if (!scores || !rackCounts || !isInt(v.bagCount) || !isInt(v.scoreless)) return null;
  if (v.turn !== null && !(isStr(v.turn) && players.includes(v.turn))) return null;
  let rack: string[] | null = null;
  if (v.rack !== null) {
    rack = strArray(v.rack);
    if (!rack || rack.length > RACK_SIZE || !rack.every((c) => /^[A-Z?]$/.test(c))) return null;
  }
  let racks: Record<string, string[]> | null = null;
  if (v.racks !== null && v.racks !== undefined) {
    if (!isRec(v.racks)) return null;
    racks = {};
    for (const id of players) {
      const r = strArray(v.racks[id]);
      if (!r) return null;
      racks[id] = r;
    }
  }
  let last: WordTilesMoveView | null = null;
  if (v.last !== null && v.last !== undefined) {
    last = parseMove(v.last);
    if (!last) return null;
  }
  const endReason = v.endReason === 'out' || v.endReason === 'passes' ? v.endReason : null;
  return {
    players,
    board,
    scores,
    turn: v.turn === null ? null : (v.turn as string),
    bagCount: v.bagCount,
    rackCounts,
    rack,
    racks,
    scoreless: v.scoreless,
    over: v.over === true,
    endReason,
    wentOut: isStr(v.wentOut) ? v.wentOut : null,
    last,
  };
}

/** "You 148 · Zainab 131" (every player, you first). */
export function wordTilesScoreLine(
  view: WordTilesView,
  myId: string | null,
  nameOf: (id: string) => string,
): string {
  const order = [...view.players].sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0));
  return order
    .map((id) => `${id === myId ? 'You' : nameOf(id)} ${view.scores[id] ?? 0}`)
    .join(' · ');
}

// ---- squares ------------------------------------------------------------------------------------------

export const idx = (r: number, c: number): number => r * SIZE + c;

export const premiumAt = (r: number, c: number): WordTilesPremium =>
  WORD_TILES_PREMIUMS[idx(r, c)] ?? null;

/** The short label printed on a premium square. */
export function premiumLabel(p: WordTilesPremium, r: number, c: number): string {
  if (r === WORD_TILES_CENTER && c === WORD_TILES_CENTER) return '★';
  return p === 'TW' ? '3W' : p === 'DW' ? '2W' : p === 'TL' ? '3L' : p === 'DL' ? '2L' : '';
}

const PREMIUM_NAME: Record<Exclude<WordTilesPremium, null>, string> = {
  TW: 'triple word',
  DW: 'double word',
  TL: 'triple letter',
  DL: 'double letter',
};

/** "Row 8, column 8, centre star, double word" or "Row 3, column 5, tile J". */
export function squareLabel(r: number, c: number, cell: string, pending: string | null): string {
  const where = `Row ${r + 1}, column ${c + 1}`;
  if (pending) return `${where}, your tile ${pending}, not played yet. Tap to take it back.`;
  if (cell)
    return `${where}, tile ${cell.toUpperCase()}${cell === cell.toLowerCase() ? ', blank' : ''}`;
  const p = premiumAt(r, c);
  const parts = [where, 'empty'];
  if (r === WORD_TILES_CENTER && c === WORD_TILES_CENTER) parts.push('centre star');
  if (p) parts.push(PREMIUM_NAME[p]);
  return parts.join(', ');
}

/** The points printed on a tile ('?' and a blank on the board are worth 0). */
export const tileValue = (ch: string): number =>
  ch === '' || ch === '?' || ch === ch.toLowerCase() ? 0 : (WORD_TILES_LETTER_VALUES[ch] ?? 0);

/** The cells of the last move, for the highlight (the tiles that play put down). */
export function lastTiles(view: WordTilesView): Set<number> {
  return new Set((view.last?.kind === 'play' ? view.last.tiles : []).map((t) => idx(t.r, t.c)));
}

// ---- tiles put down this turn --------------------------------------------------------------------------

/** A tile from your rack sitting on a square, not sent yet. `letter` is what a blank stands for ('' = not chosen). */
export type Pending = { rackIdx: number; r: number; c: number; letter: string };

/**
 * Put rack tile `rackIdx` on (r, c): the square must be empty on the board. A tile already pending there is
 * sent back to the rack; the tile moves if it was already placed. Returns null when the square is taken.
 */
export function placeTile(
  pending: readonly Pending[],
  board: readonly string[],
  rack: readonly string[],
  rackIdx: number,
  r: number,
  c: number,
): Pending[] | null {
  if (r < 0 || c < 0 || r >= SIZE || c >= SIZE || board[idx(r, c)] !== '') return null;
  const ch = rack[rackIdx];
  if (ch === undefined) return null;
  const rest = pending.filter((p) => p.rackIdx !== rackIdx && !(p.r === r && p.c === c));
  return [...rest, { rackIdx, r, c, letter: ch === '?' ? '' : ch }];
}

/** Take the tile on (r, c) back to the rack. */
export const removeAt = (pending: readonly Pending[], r: number, c: number): Pending[] =>
  pending.filter((p) => !(p.r === r && p.c === c));

export const pendingAt = (pending: readonly Pending[], r: number, c: number): Pending | undefined =>
  pending.find((p) => p.r === r && p.c === c);

/** Say what a placed blank stands for. */
export const setBlank = (
  pending: readonly Pending[],
  r: number,
  c: number,
  letter: string,
): Pending[] => pending.map((p) => (p.r === r && p.c === c ? { ...p, letter } : p));

/** The pending tiles as the engine's `play` tiles. Null while a blank has no letter yet. */
export function toTiles(
  rack: readonly string[],
  pending: readonly Pending[],
): WordTilesTile[] | null {
  const out: WordTilesTile[] = [];
  for (const p of pending) {
    const ch = rack[p.rackIdx];
    if (ch === undefined) return null;
    if (ch === '?') {
      if (!/^[A-Z]$/.test(p.letter)) return null;
      out.push({ r: p.r, c: p.c, letter: p.letter, blank: true });
    } else {
      out.push({ r: p.r, c: p.c, letter: ch });
    }
  }
  return out;
}

/** True when a pending blank still needs its letter (the picker is waiting). */
export const blankNeedingLetter = (
  rack: readonly string[],
  pending: readonly Pending[],
): Pending | null => pending.find((p) => rack[p.rackIdx] === '?' && p.letter === '') ?? null;

export type Preview =
  | { kind: 'empty' }
  | { kind: 'blank' }
  | { kind: 'ok'; score: number; words: { word: string; score: number }[]; bingo: boolean }
  | { kind: 'error'; code: string; invalid: string[]; message: string };

/** The server-side dictionary shape the engine needs (`has`). */
export type WordLookup = { has: (upperWord: string) => boolean };

/** The live preview of what is on the board right now: score and words, or why it is not a play. */
export function previewPlay(
  board: readonly string[],
  rack: readonly string[],
  pending: readonly Pending[],
  words: WordLookup,
): Preview {
  if (pending.length === 0) return { kind: 'empty' };
  const tiles = toTiles(rack, pending);
  if (!tiles) return { kind: 'blank' };
  const res = wordTilesAnalysePlay(board, rack, tiles, words);
  if (res.ok) {
    return {
      kind: 'ok',
      score: res.score,
      words: res.words.map((w) => ({ word: w.word, score: w.score })),
      bingo: res.bingo,
    };
  }
  return {
    kind: 'error',
    code: res.code,
    invalid: res.invalid ?? [],
    message: playErrorMessage(res.code, res.invalid ?? []),
  };
}

/** Friendly copy for each reason the engine refuses a play. */
export function playErrorMessage(code: string, invalid: readonly string[] = []): string {
  switch (code) {
    case 'invalid_word': {
      const list = invalid.map((w) => `“${w}”`).join(', ');
      return invalid.length === 1
        ? `${list} isn’t in the word list`
        : `${list || 'Those words'} aren’t in the word list`;
    }
    case 'not_in_line':
      return 'Tiles must be in one row or one column';
    case 'gap':
      return 'No gaps: fill the squares between your tiles';
    case 'must_cover_center':
      return 'The first word must cover the ★ in the middle';
    case 'first_word_too_short':
      return 'The first word needs at least two tiles';
    case 'not_connected':
      return 'Your word must touch the tiles already on the board';
    case 'no_word':
      return 'That doesn’t make a word yet';
    case 'tiles_not_in_rack':
      return 'Those tiles aren’t in your rack';
    case 'square_taken':
    case 'duplicate_square':
      return 'That square is already taken';
    default:
      return 'That isn’t a play yet';
  }
}

/** "JOLLOF · 24 pts" for a good play: the longest word and the total (plus "all seven tiles" bonus). */
export function previewLine(p: Preview): string | null {
  if (p.kind !== 'ok') return null;
  const main = [...p.words].sort((a, b) => b.word.length - a.word.length)[0];
  const extra = p.words.length > 1 ? ` +${p.words.length - 1} more` : '';
  return `${main ? main.word : 'Play'}${extra} · ${p.score} ${p.score === 1 ? 'pt' : 'pts'}${p.bingo ? ' · all 7 tiles!' : ''}`;
}

// ---- the rack ------------------------------------------------------------------------------------------

/** Rack positions in display order. Keeps your order while the rack is the same size; a new rack resets it. */
export function syncOrder(order: readonly number[], length: number): number[] {
  if (
    order.length === length &&
    order.every((i) => i >= 0 && i < length) &&
    new Set(order).size === length
  ) {
    return [...order];
  }
  return Array.from({ length }, (_, i) => i);
}

/** Rack letters of the rack positions picked for an exchange. */
export const lettersAt = (rack: readonly string[], picks: readonly number[]): string[] =>
  picks.map((i) => rack[i]).filter((c): c is string => c !== undefined);

/** Tiles can be swapped only while the bag holds a full rack (the engine's rule). */
export const canExchange = (view: WordTilesView): boolean => view.bagCount >= RACK_SIZE;

export const toggleIn = (picks: readonly number[], i: number): number[] =>
  picks.includes(i) ? picks.filter((p) => p !== i) : [...picks, i];

// ---- zoom -----------------------------------------------------------------------------------------------

/** The width of a square at the fitted size (the whole board in `width`), never below 12 points (zoom is there for the detail). */
export const fitCell = (width: number): number => Math.max(12, Math.floor(width / SIZE));

/** The zoomed square: the 44pt touch target. */
export const ZOOM_CELL = 44;

/**
 * Where to scroll a zoomed board so square (r, c) sits in the middle of the viewport, clamped to the board.
 */
export function scrollFor(
  r: number,
  c: number,
  cell: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const total = cell * SIZE;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(Math.max(0, max), v));
  return {
    x: clamp((c + 0.5) * cell - viewW / 2, total - viewW),
    y: clamp((r + 0.5) * cell - viewH / 2, total - viewH),
  };
}

/** The square under a point inside the board (coordinates from the board's top-left), or null outside it. */
export function cellAtPoint(x: number, y: number, cell: number): { r: number; c: number } | null {
  if (cell <= 0 || x < 0 || y < 0) return null;
  const c = Math.floor(x / cell);
  const r = Math.floor(y / cell);
  return r >= SIZE || c >= SIZE ? null : { r, c };
}

// ---- lines of text -------------------------------------------------------------------------------------

/** What the last move was, in words. */
export function lastMoveLine(
  view: WordTilesView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  const m = view.last;
  if (!m) return null;
  const who = m.by === myId ? 'You' : nameOf(m.by);
  if (m.kind === 'pass') return `${who} passed`;
  if (m.kind === 'exchange') {
    return `${who} swapped ${m.exchanged} ${m.exchanged === 1 ? 'tile' : 'tiles'}`;
  }
  const main = [...m.words].sort((a, b) => b.word.length - a.word.length)[0];
  return `${who} played ${main ? main.word : 'a word'} for ${m.score}${m.bingo ? ' (all 7 tiles!)' : ''}`;
}

/** The status line when it is not your turn. */
export function waitingLine(view: WordTilesView, nameOf: (id: string) => string): string {
  return view.turn ? `Waiting for ${nameOf(view.turn)}` : 'Game over';
}

/** The pile line: "62 tiles left in the bag". */
export const bagLine = (n: number): string =>
  n === 0 ? 'The bag is empty' : `${n} ${n === 1 ? 'tile' : 'tiles'} left in the bag`;

/** Two scoreless turns in a row each ends the game: say so when it is close. */
export function endingLine(view: WordTilesView, playerCount: number): string | null {
  const left = playerCount * 2 - view.scoreless;
  return view.scoreless > 0 && left <= playerCount
    ? `Game ends if ${left} more ${left === 1 ? 'turn is' : 'turns are'} passed`
    : null;
}

export function resultReason(
  view: WordTilesView,
  nameOf: (id: string) => string,
  myId: string | null,
): string | null {
  if (!view.over) return null;
  if (view.endReason === 'out' && view.wentOut) {
    return `${view.wentOut === myId ? 'You' : nameOf(view.wentOut)} used every tile`;
  }
  return view.endReason === 'passes' ? 'Everyone passed' : null;
}
