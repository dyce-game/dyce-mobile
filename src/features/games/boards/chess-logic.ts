import {
  chessEngine,
  chessSquareName,
  type ChessEndReason,
  type ChessPromotion,
  type ChessState,
} from '@dyce/games';
import { isRecord, isStringArray } from './board-common';

/**
 * Chess on the phone: the server's view, its parser, and the pure helpers the board needs. The rules are the
 * engine's (`chessEngine`); this file only reads what the server sent (`legal` lists every legal move) and
 * turns it into highlights, labels and a predicted board.
 */

export type ChessLegalMove = { from: string; to: string; promotion?: ChessPromotion };

/** `view(state)` from `@dyce/games`: the state without its repetition bookkeeping, plus the FEN and every legal move. */
export type ChessView = Omit<ChessState, 'seen'> & { fen: string; legal: ChessLegalMove[] };

export type ChessAction =
  { kind: 'move'; from: string; to: string; promotion?: ChessPromotion } | { kind: 'resign' };

const END_REASONS: readonly ChessEndReason[] = [
  'checkmate',
  'stalemate',
  'insufficient_material',
  'repetition',
  'fifty_move',
  'resign',
];
const PROMOTIONS = ['q', 'r', 'b', 'n'] as const;

const isPromotion = (v: unknown): v is ChessPromotion =>
  typeof v === 'string' && (PROMOTIONS as readonly string[]).includes(v);
const isSquare = (v: unknown): v is string => typeof v === 'string' && /^[a-h][1-8]$/.test(v);

export function parseChessView(view: unknown): ChessView | null {
  if (!isRecord(view)) return null;
  const { players, board, turn, castling, ep, halfmove, fullmove, san, check, winner, draw } = view;
  if (!isStringArray(players) || players.length !== 2) return null;
  if (typeof board !== 'string' || board.length !== 64 || !/^[PNBRQKpnbrqk.]{64}$/.test(board)) {
    return null;
  }
  if (turn !== 0 && turn !== 1) return null;
  if (typeof castling !== 'string') return null;
  if (ep !== null && !isSquare(ep)) return null;
  if (typeof halfmove !== 'number' || typeof fullmove !== 'number') return null;
  if (!isStringArray(san)) return null;
  if (typeof check !== 'boolean' || typeof draw !== 'boolean') return null;
  if (winner !== null && typeof winner !== 'string') return null;
  const endReason = view.endReason;
  if (endReason !== null && !END_REASONS.includes(endReason as ChessEndReason)) return null;
  if (typeof view.seq !== 'number' || typeof view.fen !== 'string') return null;
  if (!Array.isArray(view.legal)) return null;
  const legal: ChessLegalMove[] = [];
  for (const m of view.legal) {
    if (!isRecord(m) || !isSquare(m.from) || !isSquare(m.to)) return null;
    if (m.promotion !== undefined && !isPromotion(m.promotion)) return null;
    legal.push(
      m.promotion === undefined
        ? { from: m.from, to: m.to }
        : { from: m.from, to: m.to, promotion: m.promotion },
    );
  }
  let last: ChessView['last'] = null;
  if (view.last !== null && view.last !== undefined) {
    const l = view.last;
    if (!isRecord(l) || typeof l.by !== 'string' || !isSquare(l.from) || !isSquare(l.to)) {
      return null;
    }
    last = {
      by: l.by,
      from: l.from,
      to: l.to,
      piece: typeof l.piece === 'string' ? l.piece : 'P',
      captured: typeof l.captured === 'string' ? l.captured : null,
      promotion: isPromotion(l.promotion) ? l.promotion : null,
      castle: l.castle === 'K' || l.castle === 'Q' ? l.castle : null,
      enPassant: l.enPassant === true,
      san: typeof l.san === 'string' ? l.san : '',
    };
  }
  return {
    players,
    board,
    turn,
    castling,
    ep,
    halfmove,
    fullmove,
    san,
    last,
    check,
    winner,
    draw,
    endReason: (endReason ?? null) as ChessEndReason | null,
    seq: view.seq,
    fen: view.fen,
    legal,
  };
}

/* ---------------------------------------------------------------- squares and pieces */

export type Side = 'w' | 'b';

/** Which side you play: the first player is White. Someone watching sees White at the bottom. */
export function sideOf(view: ChessView, myId: string | null): Side {
  return myId !== null && view.players[1] === myId ? 'b' : 'w';
}

/** Board indices (0 = a8 ... 63 = h1) in the order they are drawn, top-left first: your side at the bottom. */
export function visualOrder(side: Side): number[] {
  const out = Array.from({ length: 64 }, (_, i) => i);
  return side === 'w' ? out : out.reverse();
}

export const squareOf = (index: number): string => chessSquareName(index);
export const indexOf = (square: string): number =>
  (8 - Number(square[1])) * 8 + 'abcdefgh'.indexOf(square[0]!);

/** Is the square a light one? a1 is dark. */
export const isLightSquare = (index: number): boolean => ((index >> 3) + (index & 7)) % 2 === 0;

export const isWhitePiece = (ch: string): boolean => ch !== '.' && ch === ch.toUpperCase();

const NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export const pieceName = (ch: string): string => NAMES[ch.toLowerCase()] ?? 'piece';

/** "e4, white pawn" or "e4, empty". */
export function describeSquare(board: string, index: number): string {
  const ch = board[index]!;
  const sq = squareOf(index);
  return ch === '.'
    ? `${sq}, empty`
    : `${sq}, ${isWhitePiece(ch) ? 'white' : 'black'} ${pieceName(ch)}`;
}

/** Where the side to move can go from a square (one entry per square; `promotes` when it reaches the last rank). */
export function targetsFrom(
  view: ChessView,
  from: string,
): { to: string; promotes: boolean; capture: boolean }[] {
  const out = new Map<string, { to: string; promotes: boolean; capture: boolean }>();
  for (const m of view.legal) {
    if (m.from !== from) continue;
    if (out.has(m.to)) continue;
    const captured = view.board[indexOf(m.to)] !== '.' || isEnPassant(view, m);
    out.set(m.to, { to: m.to, promotes: m.promotion !== undefined, capture: captured });
  }
  return [...out.values()];
}

function isEnPassant(view: ChessView, m: ChessLegalMove): boolean {
  return (
    view.ep === m.to && view.board[indexOf(m.from)]!.toLowerCase() === 'p' && m.from[0] !== m.to[0]
  );
}

/** Squares that hold a piece with at least one legal move. */
export function movableSquares(view: ChessView): Set<string> {
  return new Set(view.legal.map((m) => m.from));
}

/** The promotion pieces that are legal for this move (all four, unless the server says otherwise). */
export function promotionChoices(view: ChessView, from: string, to: string): ChessPromotion[] {
  return view.legal
    .filter((m) => m.from === from && m.to === to && m.promotion !== undefined)
    .map((m) => m.promotion!);
}

export const PROMOTION_LABEL: Record<ChessPromotion, string> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
};

export const moveAction = (from: string, to: string, promotion?: ChessPromotion): ChessAction =>
  promotion ? { kind: 'move', from, to, promotion } : { kind: 'move', from, to };

/** Index of a king, or -1. */
export function kingIndex(board: string, side: Side): number {
  return board.indexOf(side === 'w' ? 'K' : 'k');
}

/* ---------------------------------------------------------------- captured pieces */

const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const ORDER = ['q', 'r', 'b', 'n', 'p'] as const;

/**
 * The pieces each side has lost, counted from what is missing from the board (a promoted pawn shows as a
 * missing pawn), and the material lead in pawns (positive: White is ahead).
 */
export function capturedPieces(board: string): {
  /** Black pieces White has taken (shown on White's side). */
  white: string[];
  /** White pieces Black has taken. */
  black: string[];
  lead: number;
} {
  const count = (ch: string) => board.split(ch).length - 1;
  const lost = (white: boolean): string[] => {
    const out: string[] = [];
    for (const t of ORDER) {
      const have = count(white ? t.toUpperCase() : t);
      const missing = Math.max(0, START_COUNT[t]! - have);
      for (let i = 0; i < missing; i++) out.push(t);
    }
    return out;
  };
  const blackLost = lost(false);
  const whiteLost = lost(true);
  const sum = (xs: string[]) => xs.reduce((n, t) => n + VALUE[t]!, 0);
  return { white: blackLost, black: whiteLost, lead: sum(blackLost) - sum(whiteLost) };
}

/* ---------------------------------------------------------------- the predicted board */

/**
 * The board after a move, worked out with the engine itself (so castling, en passant and promotion are right),
 * for showing the move at once while the server confirms it. Null if the move is not legal here.
 */
export function predictMove(
  view: ChessView,
  from: string,
  to: string,
  promotion?: ChessPromotion,
): { board: string; last: { from: string; to: string }; check: boolean } | null {
  const me = view.players[view.turn];
  if (me === undefined) return null;
  const state: ChessState = { ...view, seen: {} };
  const action = moveAction(from, to, promotion);
  if (action.kind !== 'move') return null;
  if (!chessEngine.validate(state, me, action).ok) return null;
  const next = chessEngine.apply(state, me, action);
  return { board: next.board, last: { from, to }, check: next.check };
}

/* ---------------------------------------------------------------- words */

export const END_COPY: Record<ChessEndReason, string> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate',
  insufficient_material: 'Not enough pieces to mate',
  repetition: 'The same position three times',
  fifty_move: 'Fifty moves without a capture or pawn move',
  resign: 'Resigned',
};

/** What the last move was, in words: "Rook a1 to a8, captures a queen" (for the opponent chip and the list). */
export function describeMove(board: string, m: ChessLegalMove): string {
  const piece = board[indexOf(m.from)] ?? 'P';
  const target = board[indexOf(m.to)] ?? '.';
  const takes = target !== '.' ? `, takes ${pieceName(target)}` : '';
  const promo = m.promotion ? `, becomes a ${PROMOTION_LABEL[m.promotion].toLowerCase()}` : '';
  return `${capitalise(pieceName(piece))} ${m.from} to ${m.to}${takes}${promo}`;
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The legal moves as list rows (one per from/to; a promotion is listed once and asks for the piece afterwards). */
export function listedMoves(view: ChessView): { from: string; to: string; label: string }[] {
  const seen = new Set<string>();
  const out: { from: string; to: string; label: string }[] = [];
  for (const m of view.legal) {
    const key = `${m.from}${m.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const base = describeMove(view.board, { from: m.from, to: m.to });
    out.push({ from: m.from, to: m.to, label: m.promotion ? `${base}, promotes` : base });
  }
  return out;
}

/** The headline and the second line for the bar under the board. */
export function barCopy(
  view: ChessView,
  myId: string | null,
  oppName: string,
  yourTurn: boolean,
  selected: string | null,
  targetCount: number,
): { title: string; subtitle: string | null } {
  const side = sideOf(view, myId);
  const colour = side === 'w' ? 'white' : 'black';
  const over = view.winner !== null || view.draw;
  if (over) return { title: resultTitle(view, myId, oppName), subtitle: endLine(view) };
  if (!yourTurn) {
    return {
      title: `${oppName}'s move`,
      subtitle: view.check ? 'Check on them' : 'Waiting for them to move',
    };
  }
  if (selected) {
    const piece = view.board[indexOf(selected)]!;
    return {
      title: `${capitalise(pieceName(piece))} ${selected} selected`,
      subtitle:
        targetCount === 0
          ? 'It has nowhere to go'
          : `${targetCount} ${targetCount === 1 ? 'move' : 'moves'}`,
    };
  }
  return {
    title: `Your move · ${colour}`,
    subtitle: view.check ? 'You are in check: answer it' : 'Tap a piece to see where it can go',
  };
}

function resultTitle(view: ChessView, myId: string | null, oppName: string): string {
  if (view.draw) return 'Draw';
  if (view.winner === null) return 'Game over';
  return view.winner === myId ? 'You won' : `${oppName} won`;
}

function endLine(view: ChessView): string | null {
  return view.endReason ? END_COPY[view.endReason] : null;
}

/** "You won by checkmate · 31 moves", the line under the result. */
export function chessScoreLine(
  view: ChessView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  if (view.winner === null && !view.draw) return null;
  const moves = Math.ceil(view.san.length / 2);
  const length = moves > 0 ? ` · ${moves} ${moves === 1 ? 'move' : 'moves'}` : '';
  if (view.draw) {
    return `Draw · ${view.endReason ? END_COPY[view.endReason].toLowerCase() : 'agreed'}${length}`;
  }
  const who = view.winner === myId ? 'You' : nameOf(view.winner!);
  const how = view.endReason === 'resign' ? 'by resignation' : 'by checkmate';
  return `${who} won ${how}${length}`;
}

/** The whole-board label for a screen reader: whose move, check, and where the pieces are. */
export function boardSummary(view: ChessView, side: Side): string {
  const pieces: string[] = [];
  for (let i = 0; i < 64; i++) {
    const ch = view.board[i]!;
    if (ch === '.') continue;
    if ((isWhitePiece(ch) ? 'w' : 'b') !== side) continue;
    pieces.push(`${pieceName(ch)} ${squareOf(i)}`);
  }
  return `Chess board. You play ${side === 'w' ? 'white' : 'black'}. Your pieces: ${pieces.join(', ')}.`;
}
