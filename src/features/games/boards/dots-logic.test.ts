import { dotsAndBoxesEngine, type DotsAndBoxesState } from '@dyce/games';
import {
  barCopy,
  boardSummary,
  boxMark,
  boxSides,
  boxesLeft,
  dotsScoreLine,
  hasClosing,
  isOpen,
  lineEffect,
  lineLabel,
  moveAction,
  openLines,
  parseDotsView,
  predictLine,
  sameLine,
  touching,
  type DotsView,
  type Line,
} from './dots-logic';

const A = 'user-a';
const B = 'user-b';
const nameOf = (id: string) => (id === A ? 'Ada' : 'Bola');

const fresh = (dots = 5) => dotsAndBoxesEngine.init([A, B], 1n, { dots });
const wireOf = (s: DotsAndBoxesState): unknown =>
  JSON.parse(JSON.stringify(dotsAndBoxesEngine.view(s, A)));
function viewOf(s: DotsAndBoxesState): DotsView {
  const v = parseDotsView(wireOf(s));
  if (!v) throw new Error('view did not parse');
  return v;
}

/** Plays lines in turn order, as the engine would. */
function play(lines: Line[], dots = 3): DotsAndBoxesState {
  let s = fresh(dots);
  for (const l of lines) {
    const by = s.players[s.turn]!;
    const a = moveAction(l);
    const v = dotsAndBoxesEngine.validate(s, by, a);
    if (!v.ok) throw new Error(`illegal ${l.dir}${l.r}${l.c}: ${v.code}`);
    s = dotsAndBoxesEngine.apply(s, by, a);
  }
  return s;
}
const h = (r: number, c: number): Line => ({ dir: 'h', r, c });
const v = (r: number, c: number): Line => ({ dir: 'v', r, c });

describe('parseDotsView', () => {
  it('reads the engine state', () => {
    const view = viewOf(fresh());
    expect(view.dots).toBe(5);
    expect(view.h).toHaveLength(20);
    expect(view.v).toHaveLength(20);
    expect(view.boxes).toHaveLength(16);
    expect(view.last).toBeNull();
    expect(openLines(view)).toHaveLength(40);
  });

  it('keeps the last line and the boxes it closed', () => {
    // Close the top-left box of a 3-dot board: top, left, bottom by alternating, then right closes it.
    const s = play([h(0, 0), h(1, 0), v(0, 0), v(0, 1)]);
    const view = viewOf(s);
    expect(view.last).toMatchObject({ dir: 'v', r: 0, c: 1, boxes: [0] });
    expect(view.scores).toEqual([0, 1]);
    expect(view.turn).toBe(1); // closing a box keeps the turn with the one who closed it
  });

  it('refuses anything it does not recognise', () => {
    const good = wireOf(fresh()) as Record<string, unknown>;
    expect(parseDotsView(null)).toBeNull();
    expect(parseDotsView({ ...good, dots: 2 })).toBeNull();
    expect(parseDotsView({ ...good, dots: 9 })).toBeNull();
    expect(parseDotsView({ ...good, h: [1, 2] })).toBeNull();
    expect(parseDotsView({ ...good, boxes: new Array(16).fill(7) })).toBeNull();
    expect(parseDotsView({ ...good, scores: [1] })).toBeNull();
    expect(parseDotsView({ ...good, turn: 5 })).toBeNull();
    expect(parseDotsView({ ...good, endReason: 'bored' })).toBeNull();
    expect(parseDotsView({ ...good, last: { by: A, dir: 'x', r: 0, c: 0, boxes: [] } })).toBeNull();
  });
});

describe('lines and boxes', () => {
  it('counts the sides of a box and finds the boxes a line touches', () => {
    const view = viewOf(play([h(0, 0), h(1, 0)]));
    expect(boxSides(view, 0, 0)).toBe(2);
    expect(boxSides(view, 0, 1)).toBe(0);
    expect(touching(view, h(0, 0))).toEqual([[0, 0]]); // top edge: one box
    expect(touching(view, h(1, 0))).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(touching(view, v(0, 0))).toEqual([[0, 0]]);
    expect(touching(view, v(0, 1))).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });

  it('knows which lines are open and the same', () => {
    const view = viewOf(play([h(0, 0)]));
    expect(isOpen(view, h(0, 0))).toBe(false);
    expect(isOpen(view, h(0, 1))).toBe(true);
    expect(sameLine(h(0, 0), h(0, 0))).toBe(true);
    expect(sameLine(h(0, 0), v(0, 0))).toBe(false);
    expect(sameLine(null, h(0, 0))).toBe(false);
  });
});

describe('what a line would do', () => {
  it('is safe on an empty board', () => {
    const view = viewOf(fresh());
    expect(lineEffect(view, h(0, 0))).toBe('safe');
    expect(hasClosing(view)).toBe(false);
  });

  it('warns about the third side of a box', () => {
    const view = viewOf(play([h(0, 0), h(1, 0)])); // box (0,0) has top and bottom
    expect(lineEffect(view, v(0, 0))).toBe('gives'); // third side
    expect(lineEffect(view, v(0, 1))).toBe('gives');
    expect(lineEffect(view, h(0, 1))).toBe('safe');
  });

  it('spots a box that is ready to close', () => {
    const view = viewOf(play([h(0, 0), h(1, 0), v(0, 0)]));
    expect(lineEffect(view, v(0, 1))).toBe('closes');
    expect(hasClosing(view)).toBe(true);
  });
});

describe('predictLine', () => {
  it('plays the line on a copy with the engine', () => {
    const view = viewOf(play([h(0, 0), h(1, 0), v(0, 0)]));
    const p = predictLine(view, v(0, 1))!;
    expect(p.boxes[0]).toBe(view.turn);
    expect(p.scores[view.turn]).toBe(1);
    expect(p.turn).toBe(view.turn); // go again
    expect(view.boxes[0]).toBe(-1); // the view itself is untouched
  });

  it('passes the turn when no box closes, and refuses a taken line', () => {
    const view = viewOf(fresh());
    expect(predictLine(view, h(0, 0))!.turn).toBe(1);
    const after = viewOf(play([h(0, 0)]));
    expect(predictLine(after, h(0, 0))).toBeNull();
    expect(predictLine(view, { dir: 'h', r: 9, c: 9 })).toBeNull();
  });

  it('counts the boxes left', () => {
    expect(boxesLeft(viewOf(fresh()))).toBe(16);
    expect(boxesLeft(viewOf(fresh(3)))).toBe(4);
  });
});

describe('words', () => {
  it('describes a line by its dots', () => {
    const view = viewOf(play([h(0, 0)]));
    expect(lineLabel(view, h(0, 1), 0)).toBe(
      'Horizontal line from dot row 1, column 2 to dot row 1, column 3, gives them nothing',
    );
    expect(lineLabel(view, h(0, 0), 0)).toMatch(/drawn by you$/);
    expect(lineLabel(view, h(0, 0), 1)).toMatch(/drawn by them$/);
    expect(lineLabel(view, v(0, 0), 0)).toMatch(
      /^Vertical line from dot row 1, column 1 to dot row 2, column 1/,
    );
  });

  it('marks boxes', () => {
    expect(boxMark(true, 'Bayo')).toBe('Y');
    expect(boxMark(false, 'bayo')).toBe('B');
    expect(boxMark(false, 'Yemi')).toBe('T');
    expect(boxMark(false, '')).toBe('T');
  });

  it('says what is going on', () => {
    const view = viewOf(fresh());
    expect(barCopy(view, A, 'Bola', true, null).title).toBe('Your line · close a box, go again');
    expect(barCopy(view, B, 'Ada', false, null).title).toBe("Ada's line");
    expect(barCopy(view, A, 'Bola', true, h(0, 0)).subtitle).toBe('Gives them nothing');
    const ready = viewOf(play([h(0, 0), h(1, 0), v(0, 0)]));
    expect(barCopy(ready, B, 'Ada', true, null).subtitle).toBe('A box is ready to close');
    expect(barCopy(ready, B, 'Ada', true, v(0, 1)).subtitle).toBe('Closes a box, so you go again');
  });

  it('tells the opponent when you closed a box and go again', () => {
    const s = play([h(0, 0), h(1, 0), v(0, 0), v(0, 1)]);
    expect(barCopy(viewOf(s), A, 'Bola', false, null).subtitle).toBe(
      'They closed 1 box and go again',
    );
  });

  it('writes the result line and a summary', () => {
    expect(dotsScoreLine(viewOf(fresh()), A, nameOf)).toBeNull();
    const done: DotsAndBoxesState = {
      ...fresh(),
      scores: [9, 7],
      winner: A,
      endReason: 'complete',
    };
    expect(dotsScoreLine(viewOf(done), A, nameOf)).toBe('You 9 · Bola 7');
    expect(dotsScoreLine(viewOf(done), B, nameOf)).toBe('Ada 9 · You 7');
    const resigned = dotsAndBoxesEngine.apply(fresh(), A, { kind: 'resign' });
    expect(dotsScoreLine(viewOf(resigned), B, nameOf)).toMatch(/^Resigned/);
    expect(barCopy(viewOf(done), A, 'Bola', false, null).title).toBe('You won');
    expect(boardSummary(viewOf(done), 0, 'Bola')).toBe(
      'Dots and boxes, 4 by 4. You own 9 boxes, Bola owns 7. 16 boxes left.',
    );
  });
});
