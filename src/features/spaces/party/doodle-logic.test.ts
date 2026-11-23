import {
  applyCanvas,
  diffCanvas,
  doodleGuessEngine,
  splitDoodleView,
  type CanvasStroke,
  type DoodleState,
} from '@dyce/games';
import {
  BRUSHES,
  CELLS,
  MAX_POINTS,
  MAX_POINTS_PER_ACTION,
  PALETTE,
  SHAPES,
  SIZES,
  StrokeBuffer,
  canvasHasRoom,
  colorHex,
  doodleStage,
  drawerStrokes,
  feedLines,
  keepPoint,
  lastWord,
  letterCount,
  maskCells,
  maskSpoken,
  pointsUsed,
  sameShape,
  scoreboard,
  shapePoints,
  strokePath,
  strokePx,
  toCanvasPoint,
  type Pt,
} from './doodle-logic';
import { nameResolver } from './common-logic';
import { parseDoodleView, type DoodleView } from './views';

const P = (n: number) => Array.from({ length: n }, (_, i) => `u${i + 1}`);
const space = {
  members: P(4).map((id, i) => ({ userId: id, displayName: `Name${i + 1}`, username: id })),
} as never;
const nameOf = nameResolver(space, 'u1');
const stroke = (id: number, n: number): CanvasStroke => ({
  id,
  color: 0,
  width: 4,
  pts: Array.from({ length: n }, (_, i): Pt => [i, i]),
});

describe('touch to canvas points', () => {
  it('scales to the 0..1000 grid as integers and clamps what is off the canvas', () => {
    expect(toCanvasPoint(0, 0, 300)).toEqual([0, 0]);
    expect(toCanvasPoint(150, 75, 300)).toEqual([500, 250]);
    expect(toCanvasPoint(300, 300, 300)).toEqual([1000, 1000]);
    expect(toCanvasPoint(-20, 999, 300)).toEqual([0, 1000]);
    for (const v of toCanvasPoint(123.456, 77.7, 333)) expect(Number.isInteger(v)).toBe(true);
  });

  it('drops points too close to the last one', () => {
    expect(keepPoint(null, [1, 1])).toBe(true);
    expect(keepPoint([100, 100], [102, 101])).toBe(false);
    expect(keepPoint([100, 100], [110, 100])).toBe(true);
  });
});

describe('streaming a stroke', () => {
  it('sends the first chunk as a new stroke and later chunks as continuations, at most 64 points each', () => {
    const b = new StrokeBuffer(3, 4);
    for (let i = 0; i < 150; i++) b.add([i, i]);
    const actions = b.drain();
    expect(actions.map((a) => a.points.length)).toEqual([64, 64, 22]);
    expect(actions[0]!.cont).toBeUndefined();
    expect(actions[1]!.cont).toBe(true);
    expect(actions[2]!.cont).toBe(true);
    for (const a of actions) {
      expect(a.kind).toBe('stroke');
      expect(a.color).toBe(3);
      expect(a.width).toBe(4);
      expect(a.points.length).toBeLessThanOrEqual(MAX_POINTS_PER_ACTION);
    }
    expect(b.take()).toBeNull();
    // Points added after a send continue the same stroke.
    b.add([5, 5]);
    expect(b.take()).toMatchObject({ cont: true, points: [[5, 5]] });
    expect(b.points).toHaveLength(151);
  });

  it("is accepted by the real engine and ends up as one stroke on the guessers' screens", () => {
    let s = doodleGuessEngine.init(P(3), 77n, {}) as DoodleState;
    const drawer = s.order[0]!;
    s = doodleGuessEngine.apply(s, drawer, { kind: 'choose', index: 0 }) as DoodleState;
    const b = new StrokeBuffer(5, 6);
    for (let i = 0; i < 130; i++) b.add([i * 7, 500 + (i % 9)]);
    for (const a of b.drain()) {
      expect(doodleGuessEngine.validate(s, drawer, a).ok).toBe(true);
      s = doodleGuessEngine.apply(s, drawer, a) as DoodleState;
    }
    expect(s.strokes).toHaveLength(1);
    expect(s.strokes[0]!.pts).toHaveLength(130);
  });
});

describe('the canvas messages, as the screens use them', () => {
  it('rebuilds the drawing from reset + extend + append messages', () => {
    let s = doodleGuessEngine.init(P(3), 78n, {}) as DoodleState;
    const drawer = s.order[0]!;
    s = doodleGuessEngine.apply(s, drawer, { kind: 'choose', index: 1 }) as DoodleState;
    let cursor: Parameters<typeof diffCanvas>[0] = null;
    let client: CanvasStroke[] = [];
    const sync = () => {
      const { stream } = splitDoodleView(doodleGuessEngine.view(s, 'u2'));
      const d = diffCanvas(cursor, stream);
      cursor = d.cursor;
      if (d.msg) client = applyCanvas(client, d.msg);
    };
    sync();
    for (const a of [
      {
        kind: 'stroke',
        points: [
          [1, 1],
          [2, 2],
        ],
        color: 1,
        width: 2,
      },
      { kind: 'stroke', points: [[3, 3]], color: 1, width: 2, cont: true },
      {
        kind: 'stroke',
        points: [
          [9, 9],
          [8, 8],
        ],
        color: 4,
        width: 3,
      },
    ] as const) {
      s = doodleGuessEngine.apply(s, drawer, a as never) as DoodleState;
      sync();
    }
    expect(client.map((c) => c.pts.length)).toEqual([3, 2]);
    s = doodleGuessEngine.apply(s, drawer, { kind: 'undo' }) as DoodleState;
    sync();
    expect(client).toHaveLength(1);
    expect(pointsUsed(client)).toBe(3);
  });
});

describe("the drawer's own picture", () => {
  it('shows the local drawing until the room agrees or has had time to catch up', () => {
    const local = [stroke(0, 5), stroke(0, 3)];
    const room = [stroke(1, 5)];
    expect(sameShape(local, room)).toBe(false);
    expect(drawerStrokes(local, room, 1000, 1500).usingLocal).toBe(true);
    // The room caught up: use the room's.
    const caught = [stroke(1, 5), stroke(2, 3)];
    expect(drawerStrokes(local, caught, 1000, 1500)).toEqual({
      strokes: caught,
      usingLocal: false,
    });
    // The room never agreed (a refused stroke): give up after the grace period.
    expect(drawerStrokes(local, room, 1000, 9000).usingLocal).toBe(false);
  });

  it('tracks the canvas budget', () => {
    expect(pointsUsed([stroke(1, 10), stroke(2, 20)])).toBe(30);
    expect(canvasHasRoom([stroke(1, 10)], 50)).toBe(true);
    expect(canvasHasRoom([stroke(1, MAX_POINTS - 10)], 11)).toBe(false);
    expect(
      canvasHasRoom(
        Array.from({ length: 300 }, (_, i) => stroke(i, 1)),
        1,
      ),
    ).toBe(false);
  });
});

describe('drawing', () => {
  it('turns points into SVG path data', () => {
    expect(strokePath([], 300)).toBe('');
    expect(strokePath([[500, 500]], 300)).toMatch(/^M150\.0 150\.0l/); // a dot
    expect(
      strokePath(
        [
          [0, 0],
          [1000, 1000],
        ],
        200,
      ),
    ).toBe('M0.0 0.0L200.0 200.0');
    const long = strokePath(
      [
        [0, 0],
        [100, 200],
        [300, 100],
        [400, 400],
      ],
      1000,
    );
    expect(long.startsWith('M0.0 0.0Q')).toBe(true);
    expect(long.endsWith('L400.0 400.0')).toBe(true);
    expect(strokePx(4, 300)).toBe(6);
    expect(strokePx(1, 100)).toBe(1);
  });

  it('has 16 colours, an eraser, and brush widths the engine allows', () => {
    expect(PALETTE).toHaveLength(16);
    expect(colorHex(2)).toBe('#FFFFFF');
    expect(colorHex(99)).toBe(PALETTE[0]!.hex);
    for (const b of BRUSHES) expect(b.width >= 1 && b.width <= 8).toBe(true);
  });

  it('stamps every shape in every cell as points the engine accepts', () => {
    let s = doodleGuessEngine.init(P(3), 79n, {}) as DoodleState;
    const drawer = s.order[0]!;
    s = doodleGuessEngine.apply(s, drawer, { kind: 'choose', index: 0 }) as DoodleState;
    for (const shape of SHAPES) {
      for (let cell = 0; cell < CELLS.length; cell++) {
        for (let size = 0; size < SIZES.length; size++) {
          const pts = shapePoints(shape.name, cell, size);
          expect(pts.length).toBeGreaterThan(1);
          expect(pts.length).toBeLessThanOrEqual(MAX_POINTS_PER_ACTION);
          for (const [x, y] of pts) {
            expect(Number.isInteger(x) && x >= 0 && x <= 1000).toBe(true);
            expect(Number.isInteger(y) && y >= 0 && y <= 1000).toBe(true);
          }
          expect(
            doodleGuessEngine.validate(s, drawer, {
              kind: 'stroke',
              points: pts,
              color: 0,
              width: 3,
            }).ok,
          ).toBe(true);
        }
      }
    }
  });
});

describe('the word and the feed', () => {
  it('shows blanks for hidden letters and says them aloud', () => {
    const mask = ['J', null, null, ' ', null, 'F'];
    expect(
      maskCells(mask)
        .map((c) => (c.hidden ? '_' : c.space ? ' ' : c.ch))
        .join(''),
    ).toBe('J__ _F');
    expect(letterCount(mask)).toBe(5);
    expect(maskSpoken(mask)).toBe('5 letters: J, blank, blank, space, blank, F');
    expect(maskSpoken(null)).toBe('No word yet');
    expect(maskCells(null)).toEqual([]);
  });

  it('turns a real turn into view, feed, scoreboard and stages', () => {
    let s = doodleGuessEngine.init(P(3), 80n, {}) as DoodleState;
    const drawer = s.order[0]!;
    const guessers = s.players.filter((p) => p !== drawer);
    const viewOf = (st: DoodleState, who: string): DoodleView => {
      const { rest } = splitDoodleView(doodleGuessEngine.view(st, who));
      return parseDoodleView(rest) as DoodleView;
    };
    expect(doodleStage(viewOf(s, drawer), drawer, nameOf).role).toBe('drawer');
    expect(doodleStage(viewOf(s, guessers[0]!), guessers[0]!, nameOf).headline).toMatch(
      /choosing a word/,
    );
    expect(viewOf(s, drawer).choices).toHaveLength(3);
    expect(viewOf(s, guessers[0]!).choices).toEqual([]);

    s = doodleGuessEngine.apply(s, drawer, { kind: 'choose', index: 0 }) as DoodleState;
    const word = s.word!;
    // A guesser never gets the word in the view, the drawer does.
    expect(viewOf(s, guessers[0]!).word).toBeNull();
    expect(viewOf(s, drawer).word).toBe(word);
    s = doodleGuessEngine.apply(s, guessers[0]!, {
      kind: 'guess',
      text: 'definitely not it',
    }) as DoodleState;
    s = doodleGuessEngine.apply(s, guessers[1]!, { kind: 'guess', text: word }) as DoodleState;
    const v = viewOf(s, guessers[0]!);
    const lines = feedLines(v.feed, nameOf);
    expect(lines.map((l) => l.tone)).toEqual(['guess', 'correct']);
    expect(lines[1]!.text).toMatch(/guessed it · \+\d+/);
    const board = scoreboard(v);
    expect(board[0]!.userId).toBe(guessers[1]);
    expect(board.find((r) => r.userId === drawer)!.drawing).toBe(true);
    expect(doodleStage(viewOf(s, guessers[1]!), guessers[1]!, nameOf).role).toBe('solved');
    // The turn ends when the last guesser gets it.
    s = doodleGuessEngine.apply(s, guessers[0]!, { kind: 'guess', text: word }) as DoodleState;
    expect(lastWord(viewOf(s, 'u1'), nameOf)).toMatch(new RegExp(`“${word}”`));
  });
});
