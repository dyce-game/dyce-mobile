import { ayoEngine, seedRng, nextInt, type AyoState } from '@dyce/games';
import {
  ayoCamera,
  ayoScoreLine,
  buildSowTimeline,
  MAX_SOW_MS,
  isMyTurn,
  isOver,
  lastLine,
  layoutSeeds,
  moverOf,
  myRow,
  opposite,
  parseAyoView,
  pitXZ,
  predictSow,
  seatOf,
  sowAction,
  sowCopy,
  stateAt,
  storeXZ,
  theirRow,
  winTarget,
  type AyoView,
  type Display,
} from './ayo-logic';

const A = 'user-a';
const B = 'user-b';
const nameOf = (id: string) => (id === A ? 'Ada' : 'Bola');

const wire = (s: AyoState): unknown => JSON.parse(JSON.stringify(ayoEngine.view(s, A)));
function viewOf(s: AyoState): AyoView {
  const v = parseAyoView(wire(s));
  if (!v) throw new Error('view did not parse');
  return v;
}
const fresh = (variant: 'ayo' | 'kalah' = 'ayo') => ayoEngine.init([A, B], 1n, { variant });
const total = (d: { pits: number[]; stores: readonly number[] }) =>
  d.pits.reduce((a, b) => a + b, 0) + d.stores[0]! + d.stores[1]!;

describe('parseAyoView', () => {
  it('reads the engine view for both variants', () => {
    for (const variant of ['ayo', 'kalah'] as const) {
      const v = viewOf(fresh(variant));
      expect(v.variant).toBe(variant);
      expect(v.pits).toEqual(new Array(12).fill(4));
      expect(v.stores).toEqual([0, 0]);
      expect(v.legal).toEqual([0, 1, 2, 3, 4, 5]);
      expect(v.last).toBeNull();
      expect(winTarget(v)).toBe(25);
    }
  });

  it('reads a move record, a Kalah store lap and a finished game', () => {
    let s = fresh('kalah');
    s = ayoEngine.apply(s, A, { kind: 'sow', pit: 2 }); // 4 seeds: 3, 4, 5, store
    const v = viewOf(s);
    expect(v.last?.laps[0]?.path).toEqual([3, 4, 5, -1]);
    expect(v.last?.extraTurn).toBe(true);
    expect(v.turn).toBe(0);
    const over = viewOf(ayoEngine.apply(s, A, { kind: 'resign' }));
    expect(isOver(over)).toBe(true);
    expect(over.winner).toBe(B);
    expect(over.legal).toEqual([]);
    expect(moverOf(over)).toBeNull();
  });

  it('refuses what it does not recognise', () => {
    const good = wire(fresh()) as Record<string, unknown>;
    expect(parseAyoView(null)).toBeNull();
    expect(parseAyoView({ ...good, variant: 'oware' })).toBeNull();
    expect(parseAyoView({ ...good, pits: [1, 2, 3] })).toBeNull();
    expect(parseAyoView({ ...good, pits: new Array(12).fill(-1) })).toBeNull();
    expect(parseAyoView({ ...good, stores: [0] })).toBeNull();
    expect(parseAyoView({ ...good, turn: 2 })).toBeNull();
    expect(parseAyoView({ ...good, legal: [12] })).toBeNull();
    expect(parseAyoView({ ...good, last: { by: A, pit: 3, laps: 'x' } })).toBeNull();
  });
});

describe('seats and rows', () => {
  it('draws your own row along the bottom, from your seat, in sowing order', () => {
    expect(myRow(0)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(myRow(1)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(theirRow(0)).toEqual([11, 10, 9, 8, 7, 6]);
    expect(theirRow(1)).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('puts each pit facing its opposite, from either seat', () => {
    for (const seat of [0, 1] as const) {
      for (let p = 0; p < 12; p++) {
        const [x, z] = pitXZ(p, seat);
        const [ox, oz] = pitXZ(opposite(p), seat);
        expect(ox).toBe(x);
        expect(oz).toBe(-z);
      }
      expect(pitXZ(seat * 6, seat)[0]).toBe(-2.5);
      expect(pitXZ(seat * 6 + 5, seat)[0]).toBe(2.5);
    }
  });

  it('puts your store on the right', () => {
    expect(storeXZ(0, 0, 'kalah')[0]).toBeGreaterThan(0);
    expect(storeXZ(1, 0, 'kalah')[0]).toBeLessThan(0);
    expect(storeXZ(1, 1, 'kalah')[0]).toBeGreaterThan(0);
  });

  it('knows whose turn it is and who you are', () => {
    const v = viewOf(fresh());
    expect(seatOf(v, A)).toBe(0);
    expect(seatOf(v, B)).toBe(1);
    expect(seatOf(v, null)).toBe(0);
    expect(isMyTurn(v, A)).toBe(true);
    expect(isMyTurn(v, B)).toBe(false);
    expect(isMyTurn(v, null)).toBe(false);
    expect(moverOf(v)).toBe(A);
  });

  it('fits the camera to the wider Kalah board', () => {
    expect(ayoCamera('kalah').fitWidth).toBeGreaterThan(ayoCamera('ayo').fitWidth!);
  });
});

describe('predicting a sow', () => {
  it('matches what the engine then does, for every legal pit of a fresh board', () => {
    for (const variant of ['ayo', 'kalah'] as const) {
      const s = fresh(variant);
      const v = viewOf(s);
      for (const pit of v.legal) {
        const p = predictSow(v, pit)!;
        const real = ayoEngine.apply(s, A, { kind: 'sow', pit });
        expect(p.next.pits).toEqual(real.pits);
        expect(p.next.stores).toEqual(real.stores);
        expect(p.captured).toBe(real.last!.captured);
      }
    }
  });

  it('says where the seed lands and refuses a pit you cannot lift from', () => {
    const v = viewOf(fresh('kalah'));
    expect(predictSow(v, 2)?.lands).toBe('store');
    expect(predictSow(v, 2)?.extraTurn).toBe(true);
    expect(predictSow(v, 0)?.lands).toBe('mine');
    expect(predictSow(v, 6)).toBeNull();
    const ayo = viewOf(fresh('ayo'));
    expect(predictSow(ayo, 5)?.lands).toBe('theirs');
    expect(predictSow(ayo, 5)?.relays).toBeGreaterThanOrEqual(0);
  });

  it('writes the preview in words and the wire action the engine accepts', () => {
    const v = viewOf(fresh('kalah'));
    expect(sowCopy(v, A, 2, predictSow(v, 2))).toBe(
      'Pit 3 has 4 seeds · ends in your store: go again',
    );
    expect(sowCopy(v, A, 0, null)).toBe('Pit 1 has 4 seeds');
    expect(sowAction(3)).toEqual({ kind: 'sow', pit: 3 });
    expect(ayoEngine.validate(fresh(), A, sowAction(3) as never).ok).toBe(true);
  });

  it('numbers pits from your own side', () => {
    let s = fresh('kalah');
    s = ayoEngine.apply(s, A, { kind: 'sow', pit: 0 });
    const v = viewOf(s);
    expect(v.turn).toBe(1);
    expect(sowCopy(v, B, 6, predictSow(v, 6))).toMatch(/^Pit 1 has 4 seeds/);
    expect(sowCopy(v, B, 11, predictSow(v, 11))).toMatch(/^Pit 6 has /);
  });
});

describe('words', () => {
  it('says what the last move did', () => {
    let s = fresh('kalah');
    s = ayoEngine.apply(s, A, { kind: 'sow', pit: 2 });
    expect(lastLine(viewOf(s), A, nameOf)).toBe('You sowed pit 3 (4 seeds), and goes again');
    expect(lastLine(viewOf(s), B, nameOf)).toBe('Ada sowed pit 3 (4 seeds), and goes again');
    expect(lastLine(viewOf(fresh()), A, nameOf)).toBeNull();
  });

  it('gives the score line', () => {
    const v = viewOf(fresh());
    expect(ayoScoreLine({ ...v, stores: [26, 18] }, A, nameOf)).toBe('You 26 · Bola 18');
    expect(ayoScoreLine({ ...v, stores: [26, 18] }, B, nameOf)).toBe('You 18 · Ada 26');
  });
});

describe('the seeds on the board', () => {
  it('lays out one seed per seed, pits and stores', () => {
    const v = viewOf(fresh('kalah'));
    const d: Display = { pits: v.pits, stores: [3, 5], hand: null, fly: null };
    expect(layoutSeeds(d, 0, 'kalah')).toHaveLength(48 + 8);
    expect(layoutSeeds(d, 0, 'ayo')).toHaveLength(48);
  });

  it('keeps a seed where it is when another one is added to the pit', () => {
    const base: Display = { pits: new Array(12).fill(0), stores: [0, 0], hand: null, fly: null };
    base.pits[3] = 5;
    const a = layoutSeeds(base, 0, 'ayo');
    base.pits[3] = 6;
    const b = layoutSeeds(base, 0, 'ayo');
    expect(b.slice(0, 5)).toEqual(a);
  });

  it('never lays two seeds of a pit outside the pit', () => {
    const d: Display = { pits: new Array(12).fill(0), stores: [0, 0], hand: null, fly: null };
    d.pits[0] = 20;
    const [cx, cz] = pitXZ(0, 0);
    for (const s of layoutSeeds(d, 0, 'ayo')) {
      expect(Math.hypot(s.x - cx, s.z - cz)).toBeLessThanOrEqual(0.31);
    }
  });
});

/** A random player: picks a legal pit with the engine's RNG, so the test is repeatable. */
function randomGame(variant: 'ayo' | 'kalah', seed: number) {
  let s = ayoEngine.init([A, B], BigInt(seed), { variant });
  let rng = seedRng(BigInt(seed) + 99n);
  const steps: { before: AyoState; after: AyoState }[] = [];
  for (let i = 0; i < 400 && !ayoEngine.isTerminal(s); i++) {
    const legal = ayoEngine.view(s, A) as unknown as { legal: number[] };
    let k: number;
    [k, rng] = nextInt(rng, legal.legal.length);
    const pit = legal.legal[k]!;
    const by = s.players[s.turn]!;
    const after = ayoEngine.apply(s, by, { kind: 'sow', pit });
    steps.push({ before: s, after });
    s = after;
  }
  return steps;
}

describe('the sowing timeline', () => {
  it('ends on the board the engine reaches, for every move of many random games', () => {
    let moves = 0;
    for (const variant of ['ayo', 'kalah'] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        for (const { before, after } of randomGame(variant, seed)) {
          const last = after.last!;
          const settled = after.endReason === 'out_of_seeds' || after.endReason === 'max_plies';
          const tl = buildSowTimeline(before, last, variant, before.turn);
          if (!settled) {
            expect(tl.final.pits).toEqual(after.pits);
            expect(tl.final.stores).toEqual(after.stores);
          }
          expect(total({ pits: tl.final.pits, stores: tl.final.stores })).toBe(total(before));
          expect(tl.final.hand).toBeNull();
          moves++;
        }
      }
    }
    expect(moves).toBeGreaterThan(300);
  });

  it('shows the board before, in the middle and after', () => {
    const s = fresh('ayo');
    const after = ayoEngine.apply(s, A, { kind: 'sow', pit: 1 });
    const tl = buildSowTimeline(s, after.last!, 'ayo', 0);
    expect(tl.totalMs).toBeGreaterThan(0);
    expect(stateAt(tl, 0).pits).toEqual(s.pits);
    const mid = stateAt(tl, tl.frames[1]!.t0 + 10);
    expect(mid.hand).not.toBeNull();
    expect(mid.fly).not.toBeNull();
    expect(mid.pits[1]).toBe(0);
    expect(stateAt(tl, tl.totalMs + 50).pits).toEqual(after.pits);
    // Every seed is somewhere at every moment: on the board, in the hand or in the air.
    for (let ms = 0; ms <= tl.totalMs; ms += 37) {
      // (a capture is drawn as one decorative seed leaving a pit that still holds them)
      if (tl.frames.find((f) => ms >= f.t0 && ms < f.t1)?.label === 'capture') continue;
      const d = stateAt(tl, ms);
      const inAir = d.fly ? 1 : 0;
      expect(total(d) + (d.hand?.count ?? 0) + inAir).toBe(total(s));
    }
  });

  it('never plays longer than the cap, however long the relay chain', () => {
    let longest = 0;
    for (let seed = 1; seed <= 12; seed++) {
      for (const { before, after } of randomGame('ayo', seed)) {
        const tl = buildSowTimeline(before, after.last!, 'ayo', before.turn);
        longest = Math.max(longest, tl.totalMs);
        expect(tl.totalMs).toBeLessThanOrEqual(MAX_SOW_MS + 1e-6);
        const f = tl.frames;
        for (let i = 1; i < f.length; i++) expect(f[i]!.t0).toBeCloseTo(f[i - 1]!.t1, 6);
      }
    }
    expect(longest).toBeGreaterThan(1000);
  });

  it('flies the last Kalah seed to the mover store', () => {
    const s = fresh('kalah');
    const after = ayoEngine.apply(s, A, { kind: 'sow', pit: 2 });
    const tl = buildSowTimeline(s, after.last!, 'kalah', 0);
    const lastDrop = tl.frames[tl.frames.length - 1]!;
    expect(lastDrop.move?.to).toEqual({ kind: 'store', seat: 0 });
    expect(tl.final.stores).toEqual([1, 0]);
  });

  it('follows a relay and a capture to the end', () => {
    // Find a real game move with a relay and one with a capture, in either variant.
    let relay = 0;
    let capture = 0;
    for (const variant of ['ayo', 'kalah'] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        for (const { before, after } of randomGame(variant, seed)) {
          const tl = buildSowTimeline(before, after.last!, variant, before.turn);
          if (after.last!.laps.length > 1) relay++;
          if (after.last!.captured > 0) {
            capture++;
            expect(tl.frames[tl.frames.length - 1]!.label).toBe('capture');
          }
        }
      }
    }
    expect(relay).toBeGreaterThan(0);
    expect(capture).toBeGreaterThan(0);
  });
});
