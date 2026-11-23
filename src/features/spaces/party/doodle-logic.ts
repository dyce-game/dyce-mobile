import type { CanvasStroke } from '@dyce/games';
import { joinNames, type NameOf } from './common-logic';
import type { DoodleFeedEntry, DoodleView } from './views';

/**
 * Doodle Guess, from the player's own view, plus the drawing maths: the palette, turning touches into the
 * server's 0..1000 integer points, streaming a stroke in chunks the engine accepts, SVG paths, the shapes
 * that stand in for dragging, and keeping the drawer's local picture in step with the room's.
 * Rules: backend ADR-023; the canvas protocol is PARTY_ROOM_PROTOCOL.md 4.5.
 */

// ---- limits the engine enforces (mirrored so the UI can stop before the server refuses) ----------------

export const CANVAS_MAX = 1000;
export const MAX_POINTS_PER_ACTION = 64;
export const MAX_STROKES = 300;
export const MAX_POINTS = 4000;
export const GUESS_MAX_CHARS = 40;

export type Pt = [number, number];

/** 16 colours; the stroke carries the index (0..15). Index 2 is white: it paints over, so it is the eraser. */
export const PALETTE: readonly { name: string; hex: string }[] = [
  { name: 'Black', hex: '#1B1B1F' },
  { name: 'Grey', hex: '#8A8F98' },
  { name: 'White (eraser)', hex: '#FFFFFF' },
  { name: 'Red', hex: '#E0453A' },
  { name: 'Orange', hex: '#F08A3E' },
  { name: 'Yellow', hex: '#F5C84C' },
  { name: 'Lime', hex: '#9BCB3C' },
  { name: 'Green', hex: '#1F9D63' },
  { name: 'Teal', hex: '#1BA3A3' },
  { name: 'Sky', hex: '#5AB8F0' },
  { name: 'Blue', hex: '#2F63D8' },
  { name: 'Purple', hex: '#7B5CD6' },
  { name: 'Pink', hex: '#F27FB0' },
  { name: 'Brown', hex: '#7A4A2A' },
  { name: 'Tan', hex: '#D9B38C' },
  { name: 'Navy', hex: '#26324D' },
];
export const ERASER = 2;
export const colorHex = (i: number): string => PALETTE[i]?.hex ?? PALETTE[0]!.hex;

/** Brush widths offered (the engine takes 1..8, in 1/200 of the canvas per unit). */
export const BRUSHES: readonly { name: string; width: number }[] = [
  { name: 'Thin', width: 2 },
  { name: 'Medium', width: 4 },
  { name: 'Thick', width: 7 },
];

// ---- from touches to points ------------------------------------------------------------------------

/** A touch at (x, y) in a square canvas of `size` pixels, as the server's integer point (clamped). */
export function toCanvasPoint(x: number, y: number, size: number): Pt {
  const k = size > 0 ? CANVAS_MAX / size : 1;
  const c = (v: number) => Math.max(0, Math.min(CANVAS_MAX, Math.round(v * k)));
  return [c(x), c(y)];
}

/** Whether a new point is worth keeping: far enough from the last one (the room only needs the shape). */
export function keepPoint(last: Pt | null, p: Pt, minDist = 5): boolean {
  if (!last) return true;
  return Math.hypot(p[0] - last[0], p[1] - last[1]) >= minDist;
}

/** How much of the canvas budget is spent. */
export function pointsUsed(strokes: readonly CanvasStroke[]): number {
  let n = 0;
  for (const s of strokes) n += s.pts.length;
  return n;
}

/** Whether another stroke of `n` points fits the canvas (strokes and points are both capped per turn). */
export function canvasHasRoom(strokes: readonly CanvasStroke[], n: number): boolean {
  return strokes.length < MAX_STROKES && pointsUsed(strokes) + n <= MAX_POINTS;
}

export type StrokeAction = {
  kind: 'stroke';
  points: Pt[];
  color: number;
  width: number;
  cont?: boolean;
};

/**
 * One stroke being drawn: points pile up and leave in chunks of at most 64. The first chunk starts the
 * stroke, every later one sets `cont: true` so the room extends it (a long line is streamed in pieces).
 */
export class StrokeBuffer {
  private pending: Pt[] = [];
  private started = false;
  /** Every point drawn so far (what the drawer's own screen shows), sent or not. */
  readonly points: Pt[] = [];

  constructor(
    readonly color: number,
    readonly width: number,
  ) {}

  add(p: Pt): void {
    this.pending.push(p);
    this.points.push(p);
  }

  get waiting(): number {
    return this.pending.length;
  }

  /** The next action to send (up to 64 points), or null when nothing is waiting. */
  take(): StrokeAction | null {
    if (this.pending.length === 0) return null;
    const points = this.pending.splice(0, MAX_POINTS_PER_ACTION);
    const action: StrokeAction = { kind: 'stroke', points, color: this.color, width: this.width };
    if (this.started) action.cont = true;
    this.started = true;
    return action;
  }

  /** Everything still waiting, as actions in order. */
  drain(): StrokeAction[] {
    const out: StrokeAction[] = [];
    for (let a = this.take(); a; a = this.take()) out.push(a);
    return out;
  }
}

// ---- drawing it ------------------------------------------------------------------------------------

/**
 * SVG path data for a stroke on a square canvas of `size` pixels. One point is a dot (a zero-length line
 * with round caps); more are joined with smoothed curves through the midpoints.
 */
export function strokePath(pts: readonly Pt[], size: number): string {
  if (pts.length === 0) return '';
  const k = size / CANVAS_MAX;
  const f = (n: number) => (n * k).toFixed(1);
  const first = pts[0]!;
  if (pts.length === 1) return `M${f(first[0])} ${f(first[1])}l0.01 0`;
  if (pts.length === 2) return `M${f(first[0])} ${f(first[1])}L${f(pts[1]![0])} ${f(pts[1]![1])}`;
  let d = `M${f(first[0])} ${f(first[1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const n = pts[i + 1]!;
    d += `Q${f(p[0])} ${f(p[1])} ${f((p[0] + n[0]) / 2)} ${f((p[1] + n[1]) / 2)}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d}L${f(last[0])} ${f(last[1])}`;
}

/** Stroke width in pixels for a width unit (1..8) on a canvas of `size` pixels. */
export const strokePx = (width: number, size: number): number => Math.max(1, (width * size) / 200);

// ---- the drawer's own picture vs the room's ---------------------------------------------------------

/** Same strokes with the same number of points each (ids are the room's; a local stroke has none yet). */
export function sameShape(a: readonly CanvasStroke[], b: readonly CanvasStroke[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i]!.pts.length !== b[i]!.pts.length) return false;
  return true;
}

/**
 * What the drawer's screen shows. The drawer paints locally at once; the room's `canvas` messages confirm
 * a moment later. While they disagree and the local change is recent, show the local picture; once they
 * agree, or the room has had `graceMs` to catch up, the room's picture is the truth.
 */
export function drawerStrokes(
  local: readonly CanvasStroke[],
  room: readonly CanvasStroke[],
  changedAt: number,
  now: number,
  graceMs = 2500,
): { strokes: readonly CanvasStroke[]; usingLocal: boolean } {
  if (sameShape(local, room)) return { strokes: room, usingLocal: false };
  if (now - changedAt < graceMs) return { strokes: local, usingLocal: true };
  return { strokes: room, usingLocal: false };
}

// ---- shapes: drawing without dragging ---------------------------------------------------------------

export type ShapeName = 'circle' | 'square' | 'triangle' | 'line' | 'zigzag' | 'star';
export const SHAPES: readonly { name: ShapeName; label: string }[] = [
  { name: 'circle', label: 'Circle' },
  { name: 'square', label: 'Square' },
  { name: 'triangle', label: 'Triangle' },
  { name: 'line', label: 'Line' },
  { name: 'zigzag', label: 'Zigzag' },
  { name: 'star', label: 'Star' },
];

/** Where a stamped shape goes: a 3x3 grid, row by row. */
export const CELLS: readonly string[] = [
  'top left',
  'top',
  'top right',
  'left',
  'middle',
  'right',
  'bottom left',
  'bottom',
  'bottom right',
];
export const SIZES: readonly { name: string; radius: number }[] = [
  { name: 'Small', radius: 90 },
  { name: 'Medium', radius: 140 },
  { name: 'Large', radius: 190 },
];

/** The points of a shape centred in one of the nine cells, as a single stroke (closed shapes end where they start). */
export function shapePoints(shape: ShapeName, cell: number, sizeIdx: number): Pt[] {
  const col = cell % 3;
  const row = Math.floor(cell / 3);
  const cx = 170 + col * 330;
  const cy = 170 + row * 330;
  const r = SIZES[sizeIdx]?.radius ?? SIZES[1]!.radius;
  const clamp = (n: number) => Math.max(0, Math.min(CANVAS_MAX, Math.round(n)));
  const at = (dx: number, dy: number): Pt => [clamp(cx + dx), clamp(cy + dy)];
  switch (shape) {
    case 'circle': {
      const pts: Pt[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        pts.push(at(Math.cos(a) * r, Math.sin(a) * r));
      }
      return pts;
    }
    case 'square':
      return [at(-r, -r), at(r, -r), at(r, r), at(-r, r), at(-r, -r)];
    case 'triangle':
      return [at(0, -r), at(r, r), at(-r, r), at(0, -r)];
    case 'line':
      return [at(-r, 0), at(r, 0)];
    case 'zigzag':
      return [
        at(-r, r * 0.5),
        at(-r / 2, -r * 0.5),
        at(0, r * 0.5),
        at(r / 2, -r * 0.5),
        at(r, r * 0.5),
      ];
    case 'star': {
      const pts: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        pts.push(at(Math.cos(a) * rr, Math.sin(a) * rr));
      }
      return pts;
    }
  }
}

// ---- words and the feed ----------------------------------------------------------------------------

export type MaskCell = { ch: string; hidden: boolean; space: boolean };

/** The word as the blanks you see: letters you may read, underscores for the rest, gaps for spaces. */
export function maskCells(mask: readonly (string | null)[] | null): MaskCell[] {
  if (!mask) return [];
  return mask.map((c) =>
    c === null
      ? { ch: '', hidden: true, space: false }
      : { ch: c, hidden: false, space: c.trim() === '' },
  );
}

/** "6 letters" (spaces and punctuation do not count). */
export function letterCount(mask: readonly (string | null)[] | null): number {
  return (mask ?? []).filter((c) => c === null || /[a-z0-9]/i.test(c)).length;
}

/** What a screen reader hears for the word: "6 letters: J, blank, blank, blank, blank, F". */
export function maskSpoken(mask: readonly (string | null)[] | null): string {
  if (!mask) return 'No word yet';
  const parts = mask.map((c) => (c === null ? 'blank' : c.trim() === '' ? 'space' : c));
  return `${letterCount(mask)} letters: ${parts.join(', ')}`;
}

export type FeedLine = {
  key: number;
  who: string;
  text: string;
  tone: 'guess' | 'close' | 'correct';
};

export function feedLines(feed: readonly DoodleFeedEntry[], nameOf: NameOf): FeedLine[] {
  return feed.map((e) => {
    const who = nameOf(e.by);
    switch (e.kind) {
      case 'guess':
        return { key: e.seq, who, text: e.text, tone: 'guess' };
      case 'close':
        return { key: e.seq, who, text: 'is close!', tone: 'close' };
      case 'correct':
        return { key: e.seq, who, text: `guessed it · +${e.points}`, tone: 'correct' };
    }
  });
}

export type DoodleStage = {
  headline: string;
  sub: string;
  role: 'drawer' | 'guesser' | 'solved' | 'watching';
};

export function doodleStage(view: DoodleView, myId: string, nameOf: NameOf): DoodleStage {
  const drawer = view.drawer === myId;
  const solved = view.solvers.includes(myId);
  const turn = `Round ${view.round} of ${view.rounds}`;
  if (view.phase === 'over') return { headline: 'That is the game', sub: turn, role: 'watching' };
  if (view.phase === 'choose') {
    return drawer
      ? { headline: 'Pick a word to draw', sub: turn, role: 'drawer' }
      : { headline: `${nameOf(view.drawer)} is choosing a word`, sub: turn, role: 'guesser' };
  }
  if (drawer) return { headline: 'You are drawing', sub: turn, role: 'drawer' };
  if (solved)
    return { headline: 'You got it!', sub: `Waiting for the others. ${turn}`, role: 'solved' };
  return { headline: `${nameOf(view.drawer)} is drawing`, sub: turn, role: 'guesser' };
}

export type ScoreRow = { userId: string; score: number; solved: boolean; drawing: boolean };

/** Everyone's points, best first (table order breaks ties). */
export function scoreboard(view: DoodleView): ScoreRow[] {
  return view.players
    .map((p, i) => ({
      userId: p,
      score: view.scores[p] ?? 0,
      solved: view.solvers.includes(p),
      drawing: view.drawer === p && view.phase !== 'over',
      i,
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ i: _i, ...row }) => {
      void _i;
      return row;
    });
}

/** The word of the turn that just ended, for the "it was ..." line between turns. */
export function lastWord(view: DoodleView, nameOf: NameOf): string | null {
  const h = view.history[view.history.length - 1];
  if (!h) return null;
  const who =
    h.solvers.length === 0
      ? 'Nobody guessed it'
      : `${joinNames(h.solvers.map((s) => nameOf(s)))} guessed it`;
  return `${nameOf(h.drawer)}'s word was “${h.word}”. ${who}.`;
}
