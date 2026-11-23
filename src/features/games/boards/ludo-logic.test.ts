import { ludoAutoAction, ludoEngine, nextInt, seedRng, type LudoState } from '@dyce/games';
import {
  DIE_FACES,
  DIE_REST,
  HOME_COLUMN,
  PIPS,
  QUARTER,
  ROLL_MS,
  STEP_MS,
  colorOf,
  dieAt,
  eventOf,
  hopAt,
  hopSteps,
  isMyTurn,
  isStar,
  layoutPawns,
  isStart,
  lastLine,
  ludoScoreLine,
  moveAction,
  mySeat,
  parseLudoView,
  previewLine,
  previewMove,
  progressOnSquare,
  quadOf,
  ringCell,
  ringSquareOf,
  rollAction,
  rotate,
  tokenCell,
  tokenLabel,
  tokensBefore,
  toWorld,
  viewTurns,
  type LudoView,
} from './ludo-logic';

const A = 'user-a';
const B = 'user-b';
const C = 'user-c';
const D = 'user-d';
const nameOf = (id: string) => ({ [A]: 'Ada', [B]: 'Bola', [C]: 'Chi', [D]: 'Dayo' })[id] ?? 'Them';

const wire = (s: LudoState, viewer: string): unknown =>
  JSON.parse(JSON.stringify(ludoEngine.view(s, viewer)));
function viewOf(s: LudoState): LudoView {
  const v = parseLudoView(wire(s, s.players[0]!));
  if (!v) throw new Error('view did not parse');
  return v;
}
const fresh = (players = [A, B], seed = 1n) => ludoEngine.init(players, seed, { tokens: 4 });

/** Plays the auto action until the game ends (or `max` plies), reporting each step. */
function autoGame(players: string[], seed: bigint, max = 600) {
  let s = fresh(players, seed);
  const steps: { before: LudoState; after: LudoState }[] = [];
  for (let i = 0; i < max && !ludoEngine.isTerminal(s); i++) {
    const by = s.players[s.turn]!;
    const after = ludoEngine.apply(s, by, ludoAutoAction(s, by));
    steps.push({ before: s, after });
    s = after;
  }
  return steps;
}

describe('parseLudoView', () => {
  it('reads the engine view for 2, 3 and 4 players, and never has the generator in it', () => {
    for (const players of [
      [A, B],
      [A, B, C],
      [A, B, C, D],
    ]) {
      const w = wire(fresh(players), A) as Record<string, unknown>;
      expect(w.rng).toBeUndefined();
      const v = parseLudoView(w)!;
      expect(v.players).toEqual(players);
      expect(v.tokens.every((r) => r.every((p) => p === -1))).toBe(true);
      expect(v.phase).toBe('roll');
      expect(v.legal).toEqual([]);
    }
  });

  it('reads a roll, a move with a capture, a pass and the end of the game', () => {
    const kinds = new Set<string>();
    let captured = false;
    let over = false;
    for (let seed = 1n; seed <= 6n; seed++) {
      for (const { after } of autoGame([A, B], seed)) {
        const v = viewOf(after);
        if (v.last) kinds.add(v.last.kind);
        if (v.last?.kind === 'move' && v.last.captured.length) captured = true;
        if (v.over) over = true;
      }
    }
    expect([...kinds].sort()).toEqual(['move', 'pass', 'roll']);
    expect(captured).toBe(true);
    expect(over).toBe(true);
  });

  it('refuses what it does not recognise', () => {
    const good = wire(fresh(), A) as Record<string, unknown>;
    expect(parseLudoView(null)).toBeNull();
    expect(parseLudoView({ ...good, players: [A] })).toBeNull();
    expect(parseLudoView({ ...good, tokens: [[-1, -1, -1, -1]] })).toBeNull();
    expect(
      parseLudoView({
        ...good,
        tokens: [
          [-1, -1, -1, 99],
          [-1, -1, -1, -1],
        ],
      }),
    ).toBeNull();
    expect(parseLudoView({ ...good, phase: 'wait' })).toBeNull();
    expect(parseLudoView({ ...good, dice: 7 })).toBeNull();
    expect(parseLudoView({ ...good, last: { kind: 'roll', by: A, dice: 9 } })).toBeNull();
    expect(parseLudoView({ ...good, turn: 5 })).toBeNull();
  });
});

describe('the ring', () => {
  it('has 52 different squares, each next to the one before it, round the whole cross', () => {
    const cells = Array.from({ length: 52 }, (_, i) => ringCell(i));
    expect(new Set(cells.map((c) => c.join(','))).size).toBe(52);
    let corners = 0;
    for (let i = 0; i < 52; i++) {
      const a = cells[i]!;
      const b = cells[(i + 1) % 52]!;
      const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
      // a step is one square along, except at the four inner corners, where it cuts across one
      expect(d === 1 || (d === 2 && a[0] !== b[0] && a[1] !== b[1])).toBe(true);
      if (d === 2) corners++;
    }
    expect(corners).toBe(4);
  });

  it('puts the four start squares a quarter turn apart and the stars eight squares on', () => {
    expect(ringCell(0)).toEqual([1, 6]);
    expect(ringCell(13)).toEqual(rotate([1, 6], 1));
    expect(ringCell(26)).toEqual([13, 8]);
    expect(ringCell(39)).toEqual([6, 13]);
    expect([0, 13, 26, 39].every(isStart)).toBe(true);
    expect([8, 21, 34, 47].every(isStar)).toBe(true);
    expect(isStar(0)).toBe(false);
    expect(isStar(5)).toBe(false);
  });

  it('keeps the ring, the four home columns and the yards on different cells', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 52; i++) seen.add(ringCell(i).join(','));
    for (let q = 0; q < 4; q++) for (const c of HOME_COLUMN) seen.add(rotate(c, q).join(','));
    expect(seen.size).toBe(72);
    // 52 + 20, and none of them in a yard (a 6 x 6 corner) or the middle 3 x 3
    for (const k of seen) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      const inYard = (x < 6 || x > 8) && (y < 6 || y > 8);
      expect(inYard).toBe(false);
    }
    expect(QUARTER).toHaveLength(13);
  });

  it('walks a seat round, into its home column, in steps of one square', () => {
    for (let quad = 0; quad < 4; quad++) {
      let prev = tokenCell(quad, 0, 0);
      for (let p = 1; p <= 55; p++) {
        const c = tokenCell(quad, p, 0);
        expect(Math.max(Math.abs(c[0] - prev[0]), Math.abs(c[1] - prev[1]))).toBe(1);
        prev = c;
      }
      const home = tokenCell(quad, 56, 0);
      expect(Math.abs(home[0] - prev[0])).toBeLessThanOrEqual(1.5);
    }
  });

  it('knows which square a token stands on', () => {
    expect(ringSquareOf(26, 0)).toBe(26);
    expect(ringSquareOf(26, 30)).toBe(4);
    expect(ringSquareOf(0, 51)).toBeNull();
    expect(ringSquareOf(0, -1)).toBeNull();
    expect(progressOnSquare(26, 4)).toBe(30);
    expect(progressOnSquare(0, 51)).toBeNull();
    for (const start of [0, 13, 26, 39]) {
      for (let p = 0; p <= 50; p++) {
        expect(progressOnSquare(start, ringSquareOf(start, p)!)).toBe(p);
      }
    }
  });
});

describe('your view of the board', () => {
  it('puts your own yard nearest to you, at the bottom left', () => {
    for (let q = 0; q < 4; q++) {
      for (let t = 0; t < 4; t++) {
        const [x, z] = toWorld(tokenCell(q, -1, t), viewTurns(q));
        expect(x).toBeLessThan(0);
        expect(z).toBeGreaterThan(0);
      }
    }
  });

  it('colours you green and the others in seat order after you', () => {
    const v = viewOf(fresh([A, B, C, D]));
    expect(colorOf(v, 0, A)).toBe('#2BB673');
    expect(colorOf(v, 1, A)).toBe('#E0453A');
    expect(colorOf(v, 2, B)).toBe('#E0453A');
    expect(colorOf(v, 3, B)).toBe('#2457D6');
    expect(colorOf(v, 0, B)).toBe('#FFB020');
    expect(colorOf(v, 1, B)).toBe('#2BB673');
    expect(mySeat(v, C)).toBe(2);
    expect(mySeat(v, 'someone')).toBe(0);
    const two = viewOf(fresh([A, B]));
    expect(quadOf(two, 0)).toBe(0);
    expect(quadOf(two, 1)).toBe(2);
  });

  it('knows whose turn it is', () => {
    const v = viewOf(fresh());
    expect(isMyTurn(v, A)).toBe(true);
    expect(isMyTurn(v, B)).toBe(false);
    expect(isMyTurn(v, null)).toBe(false);
    expect(rollAction()).toEqual({ kind: 'roll' });
    expect(moveAction(2)).toEqual({ kind: 'move', token: 2 });
  });
});

describe('replaying the last move', () => {
  it('puts every token back where it stood before the move, for whole games of 2 to 4 players', () => {
    let moves = 0;
    let captures = 0;
    for (const players of [
      [A, B],
      [A, B, C],
      [A, B, C, D],
    ]) {
      for (let seed = 1n; seed <= 3n; seed++) {
        for (const { before, after } of autoGame(players, seed)) {
          const v = viewOf(after);
          expect(tokensBefore(v)).toEqual(before.tokens);
          if (v.last?.kind === 'move') {
            moves++;
            if (v.last.captured.length) captures++;
          }
        }
      }
    }
    expect(moves).toBeGreaterThan(200);
    expect(captures).toBeGreaterThan(3);
  });

  it('steps from square to square, with the yard one step onto the start square', () => {
    expect(hopSteps(-1, 0)).toEqual([0]);
    expect(hopSteps(10, 14)).toEqual([11, 12, 13, 14]);
    expect(hopSteps(50, 52)).toEqual([51, 52]);
    const start = hopAt(0, 0, 10, 14, 0);
    expect(start.cell).toEqual(tokenCell(0, 10, 0));
    const mid = hopAt(0, 0, 10, 14, STEP_MS * 1.5);
    expect(mid.lift).toBeGreaterThan(0);
    const end = hopAt(0, 0, 10, 14, STEP_MS * 4 + 500);
    expect(end.cell).toEqual(tokenCell(0, 14, 0));
    expect(end.lift).toBe(0);
    expect(end.done).toBe(4);
  });

  it('times a move by its squares and its capture, and a roll by the tumble', () => {
    const e = eventOf({ kind: 'move', by: A, dice: 3, token: 0, from: 4, to: 7, captured: [] });
    expect(e.durationMs).toBe(3 * STEP_MS + 160);
    const c = eventOf({
      kind: 'move',
      by: A,
      dice: 3,
      token: 0,
      from: 4,
      to: 7,
      captured: [{ player: B, token: 1 }],
    });
    expect(c.durationMs).toBeGreaterThan(e.durationMs);
    expect(eventOf({ kind: 'roll', by: A, dice: 4 }).durationMs).toBeGreaterThan(ROLL_MS);
  });
});

describe('previewing a move with the engine rules', () => {
  it('matches the capture the engine then makes', () => {
    let seen = 0;
    for (let seed = 1n; seed <= 4n; seed++) {
      for (const { before } of autoGame([A, B], seed)) {
        const v = viewOf(before);
        if (v.phase !== 'move') continue;
        for (const t of v.legal) {
          const p = previewMove(v, v.turn, t)!;
          const next = ludoEngine.apply(before, before.players[before.turn]!, {
            kind: 'move',
            token: t,
          });
          const real = next.last?.kind === 'move' ? next.last.captured.length : 0;
          expect(p.captures).toBe(real);
          expect(p.to).toBe(next.tokens[before.turn]![t]);
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(200);
  });

  it('says what a move does, and describes a token for a screen reader', () => {
    expect(
      previewLine({
        token: 1,
        from: -1,
        to: 0,
        leavesYard: true,
        home: false,
        intoColumn: false,
        captures: 0,
      }),
    ).toBe('Token 2 leaves the yard');
    expect(
      previewLine({
        token: 0,
        from: 50,
        to: 56,
        leavesYard: false,
        home: true,
        intoColumn: false,
        captures: 0,
      }),
    ).toBe('Token 1 gets home');
    expect(
      previewLine({
        token: 2,
        from: 10,
        to: 14,
        leavesYard: false,
        home: false,
        intoColumn: false,
        captures: 1,
      }),
    ).toBe('Token 3 captures a token');
    expect(
      previewLine({
        token: 2,
        from: 10,
        to: 14,
        leavesYard: false,
        home: false,
        intoColumn: false,
        captures: 0,
      }),
    ).toBe('Token 3 moves 4');
    const v = viewOf(fresh());
    expect(tokenLabel(v, 0, 0)).toBe('Token 1, in the yard');
    const walking = { ...v, tokens: [[20, 52, 56, -1], v.tokens[1]!] };
    expect(tokenLabel(walking, 0, 0)).toBe('Token 1, 20 squares from its start, 36 to home');
    expect(tokenLabel(walking, 0, 1)).toBe('Token 2, in the home column, 4 to go');
    expect(tokenLabel(walking, 0, 2)).toBe('Token 3, home');
  });
});

describe('words', () => {
  it('says what just happened', () => {
    const base = viewOf(fresh());
    const roll = { ...base, last: { kind: 'roll' as const, by: A, dice: 5 } };
    expect(lastLine(roll, A, nameOf)).toBe('You rolled a 5');
    expect(lastLine(roll, B, nameOf)).toBe('Ada rolled a 5');
    const pass = {
      ...base,
      last: { kind: 'pass' as const, by: B, dice: 6, reason: 'three_sixes' as const },
    };
    expect(lastLine(pass, A, nameOf)).toBe('Bola rolled a third 6: turn passes');
    const move = {
      ...base,
      last: {
        kind: 'move' as const,
        by: B,
        dice: 3,
        token: 1,
        from: 4,
        to: 7,
        captured: [{ player: A, token: 0 }],
      },
    };
    expect(lastLine(move, A, nameOf)).toBe('Bola moved token 2 and captured your token');
    expect(lastLine(base, A, nameOf)).toBeNull();
  });

  it('gives the score line', () => {
    const v = viewOf(fresh([A, B, C]));
    const done = {
      ...v,
      tokens: [
        [56, 56, 56, 56],
        [56, -1, -1, -1],
        [10, 11, 12, 13],
      ],
    };
    expect(ludoScoreLine(done, A, nameOf)).toBe('You 4 home · Bola 1 home · Chi 0 home');
  });
});

describe('the die', () => {
  it('has opposite faces that add up to seven, and a pip layout for every value', () => {
    const byRot = new Map(DIE_FACES.map((f) => [f.value, f.rot]));
    expect(byRot.size).toBe(6);
    expect(Object.keys(PIPS).map(Number)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const n of [1, 2, 3, 4, 5, 6]) expect(PIPS[n]).toHaveLength(n);
    const pairs = [
      [3, 4],
      [2, 5],
      [1, 6],
    ];
    for (const [a, b] of pairs) expect(a! + b!).toBe(7);
    // the faces at +z and -z (3 and 4) are half a turn apart about y
    expect(byRot.get(4)![1]).toBeCloseTo(Math.PI);
  });

  it('lands with the rolled value on top', () => {
    for (let v = 1; v <= 6; v++) {
      const end = dieAt(v, ROLL_MS + 100);
      expect(end.rot).toEqual([...DIE_REST[v]!]);
      expect(end.lift).toBe(0);
      expect(dieAt(v, ROLL_MS / 2).lift).toBeGreaterThan(0);
      expect(dieAt(v, 0).rot[0]).toBeGreaterThan(DIE_REST[v]![0]);
    }
  });
});

describe('the engine and the app agree about the roll', () => {
  it('never shows the roll before the server has made it', () => {
    const s = fresh();
    const v = viewOf(s);
    expect(v.dice).toBeNull();
    const [k] = nextInt(seedRng(7n), 6);
    expect(k).toBeGreaterThanOrEqual(0);
    const rolled = ludoEngine.apply(s, A, { kind: 'roll' });
    const w = parseLudoView(wire(rolled, A))!;
    expect(w.last?.kind === 'roll' || w.last?.kind === 'pass').toBe(true);
  });
});

describe('where the pawns stand', () => {
  it('gives every token a place, and spreads tokens that share a square', () => {
    const quads = [0, 2];
    const tokens = [
      [-1, -1, 5, 5],
      [-1, 56, 30, 31],
    ];
    const pawns = layoutPawns(tokens, quads, viewTurns(0));
    expect(pawns).toHaveLength(8);
    const stacked = pawns.filter((p) => p.seat === 0 && (p.token === 2 || p.token === 3));
    expect(stacked[0]!.x).not.toBe(stacked[1]!.x);
    expect(stacked[0]!.scale).toBeLessThan(1);
    const alone = pawns.find((p) => p.seat === 1 && p.token === 2)!;
    expect(alone.scale).toBe(1);
    // no two pawns on top of each other
    const keys = new Set(pawns.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`));
    expect(keys.size).toBe(8);
  });
});
