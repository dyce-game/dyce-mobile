import {
  miniGolfAutoAction,
  miniGolfEngine,
  simulateMiniGolfPutt,
  type MiniGolfState,
} from '@dyce/games';
import {
  aimAtCup,
  angleOfInput,
  angleToVector,
  clampPower,
  DRAG_FULL_PX,
  dragToAim,
  guideEnd,
  holeFor,
  holeLine,
  holeName,
  holeProgress,
  inputFromAim,
  mmToCm,
  miniGolfScoreLine,
  normAngle,
  parseMiniGolfView,
  POWER_MAX,
  puttLine,
  samePoint,
  scorecardRow,
  stepAngle,
  stepPower,
  strokeLine,
  totalsLine,
  traceAt,
  traceDurationMs,
  vectorToAngle,
  visibleLog,
  type MiniGolfView,
} from './mini-golf-logic';

const A = 'user-a';
const B = 'user-b';

function start(): MiniGolfState {
  return miniGolfEngine.init([A, B], 11n, {});
}
function view(s: MiniGolfState, viewer: string): MiniGolfView {
  const v = parseMiniGolfView(miniGolfEngine.view(s, viewer));
  if (!v) throw new Error('view did not parse');
  return v;
}

describe('parseMiniGolfView', () => {
  it('reads the engine view: only your own ball, nine holes, pars', () => {
    const v = view(start(), A);
    expect(v.players).toEqual([A, B]);
    expect(v.holes).toBe(9);
    expect(v.pars).toHaveLength(9);
    expect(v.mirror).toHaveLength(9);
    expect(v.hole).toBe(0);
    expect(v.turn).toBe(A);
    expect(Object.keys(v.ball)).toEqual([A]);
    expect(v.maxStrokes).toBe(6);
    expect(v.last).toBeNull();
    expect(v.log).toEqual([]);
  });

  it('reads a putt, and hides the other player’s putts until you are done', () => {
    let s = start();
    s = miniGolfEngine.apply(s, A, { kind: 'putt', dx: 0, dy: -1000, power: 300 });
    const mine = view(s, A);
    expect(mine.log).toHaveLength(1);
    expect(mine.last?.by).toBe(A);
    expect(mine.last?.stroke).toBe(1);
    expect(mine.strokes[A]).toBe(1);
    expect(mine.strokes[B]).toBeNull();
    const theirs = view(s, B);
    expect(theirs.log).toEqual([]);
    expect(theirs.last).toBeNull();
  });

  it('reads the scorecard once a hole is finished', () => {
    let s = start();
    for (const p of [A, B]) {
      for (let i = 0; i < 6 && s.turn === (p === A ? 0 : 1) && !s.over; i++) {
        s = miniGolfEngine.apply(s, p, { kind: 'putt', dx: 1, dy: 0, power: 1 });
      }
    }
    const v = view(s, A);
    expect(v.hole).toBe(1);
    expect(v.card[A]).toEqual([6]);
    expect(v.card[B]).toEqual([6]);
    expect(v.totals).toEqual({ [A]: 6, [B]: 6 });
    expect(scorecardRow(v, A)).toEqual({
      cells: [6, null, null, null, null, null, null, null, null],
      total: 6,
    });
  });

  it('plays a whole match to the end and reads the final view', () => {
    let s = start();
    let guard = 0;
    while (!s.over && guard++ < 400) {
      const by = s.players[s.turn] as string;
      s = miniGolfEngine.apply(s, by, miniGolfAutoAction(s, by));
    }
    expect(s.over).toBe(true);
    const v = view(s, A);
    expect(v.over).toBe(true);
    expect(v.turn).toBeNull();
    expect(v.hole).toBe(9);
    expect(Object.keys(v.ball)).toEqual([]);
    expect(v.card[A]).toHaveLength(9);
  });

  it('rejects anything it does not recognise', () => {
    const good = miniGolfEngine.view(start(), A) as Record<string, unknown>;
    expect(parseMiniGolfView(null)).toBeNull();
    expect(parseMiniGolfView({})).toBeNull();
    expect(parseMiniGolfView({ ...good, mirror: [true] })).toBeNull();
    expect(parseMiniGolfView({ ...good, hole: 12 })).toBeNull();
    expect(parseMiniGolfView({ ...good, ball: { [A]: { x: 'a', y: 1 } } })).toBeNull();
    expect(parseMiniGolfView({ ...good, log: [{ seq: 1 }] })).toBeNull();
    expect(parseMiniGolfView({ ...good, turn: 'nobody' })).toBeNull();
  });
});

describe('aim and power', () => {
  it('turns an angle into an integer direction (0 is up the screen)', () => {
    expect(angleToVector(0)).toEqual({ dx: 0, dy: -1000 });
    expect(angleToVector(90)).toEqual({ dx: 1000, dy: 0 });
    expect(angleToVector(180)).toEqual({ dx: 0, dy: 1000 });
    expect(angleToVector(270)).toEqual({ dx: -1000, dy: 0 });
    expect(angleToVector(-90)).toEqual(angleToVector(270));
  });

  it('turns a vector back into an angle', () => {
    expect(vectorToAngle(0, -5)).toBe(0);
    expect(vectorToAngle(5, 0)).toBe(90);
    expect(vectorToAngle(0, 5)).toBe(180);
    expect(vectorToAngle(-5, 0)).toBe(270);
    for (const a of [0, 7, 45, 133, 200, 359]) {
      expect(Math.abs(angleOfInput(inputFromAim(a, 500)) - a)).toBeLessThanOrEqual(1);
    }
  });

  it('aims at the cup', () => {
    // Straight above: the first hole's tee is at (200, 700) cm, the cup at (200, 120).
    const hole = holeFor(view(start(), A), 0);
    expect(aimAtCup({ x: 2000, y: 7000 }, hole.cup)).toBe(0);
    expect(aimAtCup({ x: 1000, y: 1200 }, hole.cup)).toBe(90);
  });

  it('steps and clamps', () => {
    expect(normAngle(370)).toBe(10);
    expect(normAngle(-10)).toBe(350);
    expect(stepAngle(355, 10)).toBe(5);
    expect(stepAngle(2, -5)).toBe(357);
    expect(stepPower(990, 50)).toBe(POWER_MAX);
    expect(stepPower(20, -50)).toBe(1);
    expect(clampPower(0)).toBe(1);
    expect(clampPower(1500)).toBe(POWER_MAX);
  });

  it('builds a legal engine input from any angle and power', () => {
    for (const a of [0, 1, 89, 181, 271, 359]) {
      for (const pw of [1, 333, 1000, 5000]) {
        const input = inputFromAim(a, pw);
        expect(Number.isInteger(input.dx) && Number.isInteger(input.dy)).toBe(true);
        expect(input.dx === 0 && input.dy === 0).toBe(false);
        expect(miniGolfEngine.validate(start(), A, { kind: 'putt', ...input })).toEqual({
          ok: true,
        });
      }
    }
  });

  it('pulls back like a slingshot: the ball goes the other way, farther pull is more power', () => {
    expect(dragToAim({ x: 0, y: 5 })).toBeNull();
    // Dragging down the screen shoots up it.
    expect(dragToAim({ x: 0, y: 65 })).toEqual({ angle: 0, power: 500 });
    expect(dragToAim({ x: -DRAG_FULL_PX, y: 0 })).toEqual({ angle: 90, power: POWER_MAX });
    expect(dragToAim({ x: 0, y: DRAG_FULL_PX * 3 })?.power).toBe(POWER_MAX);
    expect(dragToAim({ x: 40, y: -40 })?.angle).toBe(225);
  });

  it('draws a guide that grows with power', () => {
    const short = guideEnd({ x: 200, y: 700 }, 0, 100);
    const long = guideEnd({ x: 200, y: 700 }, 0, 1000);
    expect(short.x).toBeCloseTo(200);
    expect(700 - long.y).toBeGreaterThan(700 - short.y);
    expect(700 - long.y).toBeCloseTo(260);
  });
});

describe('playing a putt back', () => {
  const s = start();
  const hole = holeFor(view(s, A), 0);
  const from = s.ball[A]!;
  const input = inputFromAim(0, 600);
  const sim = simulateMiniGolfPutt(hole, from.x, from.y, input, true);

  it('the trace ends where the engine says the ball ends (the server agrees)', () => {
    const next = miniGolfEngine.apply(s, A, { kind: 'putt', ...input });
    const putt = view(next, A).last!;
    expect(putt.to).toEqual({ x: sim.outcome.endX, y: sim.outcome.endY });
    const last = sim.trace[sim.trace.length - 1]!;
    expect(samePoint({ x: last[0], y: last[1] }, putt.to)).toBe(true);
  });

  it('interpolates the trace in time and clamps to its ends', () => {
    const start0 = traceAt(sim.trace, 0);
    expect(start0).toEqual(mmToCm(from));
    const total = traceDurationMs(sim.trace);
    expect(total).toBeGreaterThan(300);
    const end = traceAt(sim.trace, total + 5000);
    const lastKey = sim.trace[sim.trace.length - 1]!;
    expect(end).toEqual({ x: lastKey[0] / 10, y: lastKey[1] / 10 });
    const mid = traceAt(sim.trace, total / 2);
    expect(mid.y).toBeLessThan(start0.y);
    expect(traceAt([], 100)).toEqual({ x: 0, y: 0 });
    expect(traceDurationMs([[1, 2]])).toBe(0);
  });

  it('replays another player’s putt from its stored input and gets the same end', () => {
    let st = s;
    st = miniGolfEngine.apply(st, A, { kind: 'putt', dx: 0, dy: -1000, power: 1000 });
    const putt = view(st, A).last!;
    const again = simulateMiniGolfPutt(hole, putt.from.x, putt.from.y, putt.input, true);
    expect({ x: again.outcome.endX, y: again.outcome.endY }).toEqual(putt.to);
  });
});

describe('lines of text', () => {
  const name = (id: string) => (id === B ? 'Tolu' : id);

  it('writes the hole, stroke and totals lines', () => {
    const v = view(start(), A);
    expect(holeLine(v)).toBe('HOLE 1 · PAR 2');
    expect(holeLine({ ...v, hole: 9 })).toBe('HOLE 9 · PAR -');
    expect(strokeLine(2, 6)).toBe('Stroke 2 of 6');
    const tot = { ...v, totals: { [A]: 9, [B]: 10 } };
    expect(totalsLine(tot, A, name)).toBe('Total: you 9 · Tolu 10');
    expect(miniGolfScoreLine(tot, A, name)).toBe('You 9 · Tolu 10');
    expect(miniGolfScoreLine(tot, B, name)).toBe('You 10 · user-a 9');
  });

  it('names how a hole went', () => {
    expect(holeName(1, 3)).toBe('Hole in one!');
    expect(holeName(2, 4)).toBe('Eagle');
    expect(holeName(2, 3)).toBe('Birdie');
    expect(holeName(3, 3)).toBe('Par');
    expect(holeName(4, 3)).toBe('Bogey');
    expect(holeName(6, 3)).toBe('3 over par');
    expect(holeName(6, 3, false)).toBe('Out of strokes');
  });

  it('says what a putt did', () => {
    const base = {
      seq: 1,
      hole: 0,
      by: B,
      stroke: 3,
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      input: { dx: 1, dy: 1, power: 1 },
      bounces: 0,
    };
    expect(puttLine({ ...base, sunk: true }, 'Tolu', 3)).toBe('Tolu holed out in 3 (Par)');
    expect(puttLine({ ...base, sunk: false }, 'Tolu', 3)).toBe('Tolu putt 3');
  });

  it('reports the others’ strokes on this hole once they are done', () => {
    const v = view(start(), A);
    expect(holeProgress(v, A, name)).toBeNull();
    const done = {
      ...v,
      done: { [A]: false, [B]: true },
      strokes: { [A]: 1, [B]: 4 },
      sunk: { [A]: null, [B]: true },
    };
    expect(holeProgress(done, A, name)).toBe('Tolu holed out in 4');
    expect(holeProgress({ ...done, sunk: { [A]: null, [B]: false } }, A, name)).toBe('Tolu took 4');
  });

  it('lists only the putts on the current hole', () => {
    const v = view(start(), A);
    const p = {
      seq: 1,
      hole: 0,
      by: A,
      stroke: 1,
      from: { x: 0, y: 0 },
      to: { x: 1, y: 1 },
      input: { dx: 1, dy: 1, power: 1 },
      sunk: false,
      bounces: 0,
    };
    expect(visibleLog({ ...v, log: [p, { ...p, hole: 3 }] })).toHaveLength(1);
  });
});
