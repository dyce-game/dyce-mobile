import { tanksAutoAction, tanksEngine, type TanksState } from '@dyce/games';
import {
  ammoLeft,
  barrelTip,
  clampAngle,
  clampPower,
  damageText,
  defaultAim,
  dragToAim,
  flipY,
  frameAt,
  guideArc,
  hpAfter,
  hpColor,
  lastShotLine,
  myIndex,
  parseTanksView,
  planShot,
  replayFromResult,
  sameImpacts,
  shotLine,
  tankAt,
  tanksScoreLine,
  terrainAfter,
  terrainPoints,
  timeline,
  weaponInfo,
  weaponLabel,
  windLabel,
  windSpoken,
  type TanksView,
} from './tanks-logic';

const A = 'user-a';
const B = 'user-b';

function start(seed = 5n): TanksState {
  return tanksEngine.init([A, B], seed, {});
}
function view(s: TanksState, viewer = A): TanksView {
  const v = parseTanksView(tanksEngine.view(s, viewer));
  if (!v) throw new Error('view did not parse');
  return v;
}

describe('parseTanksView', () => {
  it('reads the engine view: terrain, tanks, hp, ammo, wind', () => {
    const v = view(start());
    expect(v.players).toEqual([A, B]);
    expect(v.terrain).toHaveLength(200);
    expect(v.tankCols).toEqual([25, 175]);
    expect(v.hp).toEqual([100, 100]);
    expect(v.ammo[A]).toEqual({ heavy: 2, triple: 2 });
    expect(v.wind).toBeGreaterThanOrEqual(-10);
    expect(v.wind).toBeLessThanOrEqual(10);
    expect(v.turn).toBe(0);
    expect(v.last).toBeNull();
    expect(v.over).toBe(false);
    expect(v).not.toHaveProperty('rng');
  });

  it('reads the last shot and the ground after it', () => {
    const s = start();
    const next = tanksEngine.apply(s, A, { kind: 'fire', angle: 45, power: 60, weapon: 'shell' });
    const v = view(next, B);
    expect(v.turn).toBe(1);
    expect(v.last?.by).toBe(A);
    expect(v.last?.weapon).toBe('shell');
    expect(v.last?.impacts).toHaveLength(1);
    expect(v.shots).toEqual([1, 0]);
    expect(v.seq).toBe(1);
    expect(v.last?.wind).toBe(s.wind);
  });

  it('reads a finished game and its winner', () => {
    let s = start();
    let guard = 0;
    while (!s.over && guard++ < 60) {
      s = tanksEngine.apply(s, s.players[s.turn], tanksAutoAction(s));
    }
    const v = view(s);
    expect(v.over).toBe(true);
    expect(v.shots[0]).toBe(12);
    expect(v.winner === null || v.players.includes(v.winner)).toBe(true);
  });

  it('rejects anything it does not recognise', () => {
    const good = tanksEngine.view(start(), A) as Record<string, unknown>;
    expect(parseTanksView(null)).toBeNull();
    expect(parseTanksView({})).toBeNull();
    expect(parseTanksView({ ...good, terrain: [1, 2, 3] })).toBeNull();
    expect(parseTanksView({ ...good, tankCols: [1, 500] })).toBeNull();
    expect(parseTanksView({ ...good, turn: 2 })).toBeNull();
    expect(parseTanksView({ ...good, hp: [100] })).toBeNull();
    expect(parseTanksView({ ...good, ammo: {} })).toBeNull();
    expect(parseTanksView({ ...good, last: { seq: 1 } })).toBeNull();
    expect(parseTanksView({ ...good, players: [A] })).toBeNull();
  });
});

describe('aim and power', () => {
  it('clamps to the engine’s ranges', () => {
    expect(clampAngle(-5)).toBe(0);
    expect(clampAngle(200)).toBe(180);
    expect(clampAngle(44.6)).toBe(45);
    expect(clampPower(0)).toBe(1);
    expect(clampPower(500)).toBe(100);
  });

  it('starts aimed up and toward the other tank', () => {
    const v = view(start());
    expect(defaultAim(v, 0)).toEqual({ angle: 45, power: 60 });
    expect(defaultAim(v, 1)).toEqual({ angle: 135, power: 60 });
  });

  it('drags from the tank: barrel at the finger, distance is power', () => {
    const from = { x: 100, y: 100 };
    expect(dragToAim(from, { x: 105, y: 105 })).toBeNull();
    expect(dragToAim(from, { x: 100, y: 230 })).toEqual({ angle: 90, power: 50 });
    expect(dragToAim(from, { x: 360, y: 100 })).toEqual({ angle: 0, power: 100 });
    expect(dragToAim(from, { x: 0, y: 100 })).toEqual({ angle: 180, power: 38 });
    // Below the horizon is flat, on the side of the finger.
    expect(dragToAim(from, { x: 200, y: 20 })?.angle).toBe(0);
    expect(dragToAim(from, { x: 20, y: 20 })?.angle).toBe(180);
    expect(dragToAim(from, { x: 100 + 100, y: 100 + 100 })?.angle).toBe(45);
  });

  it('puts the barrel tip on the right side', () => {
    const tip = barrelTip({ x: 0, y: 0 }, 90, 10);
    expect(tip.x).toBeCloseTo(0);
    expect(tip.y).toBeCloseTo(10);
    expect(barrelTip({ x: 0, y: 0 }, 180, 10).x).toBeCloseTo(-10);
  });

  it('draws a guide arc that rises then falls, and goes farther with power', () => {
    const arc = guideArc({ x: 0, y: 0 }, 60, 80, 9);
    expect(arc).toHaveLength(9);
    expect(arc[1]!.y).toBeGreaterThan(arc[0]!.y);
    expect(guideArc({ x: 0, y: 0 }, 45, 100)[5]!.x).toBeGreaterThan(
      guideArc({ x: 0, y: 0 }, 45, 40)[5]!.x,
    );
  });
});

describe('weapons', () => {
  it('counts ammo: the shell is unlimited, the others run out', () => {
    const v = view(start());
    expect(ammoLeft(v, A, 'shell')).toBeNull();
    expect(ammoLeft(v, A, 'heavy')).toBe(2);
    expect(weaponLabel(v, A, 'shell')).toBe('Shell');
    expect(weaponLabel(v, A, 'heavy')).toBe('Big shot · 2 left');
    expect(weaponLabel(v, A, 'triple')).toBe('Triple · 2 left');
    expect(weaponInfo('triple')).toContain('3 small shells');
    const used = tanksEngine.apply(start(), A, {
      kind: 'fire',
      angle: 45,
      power: 60,
      weapon: 'heavy',
    });
    expect(ammoLeft(view(used), A, 'heavy')).toBe(1);
  });
});

describe('planning and playing a shot', () => {
  it('predicts exactly what the server will do (same simulation)', () => {
    const s = start(9n);
    const v = view(s);
    for (const [weapon, angle, power] of [
      ['shell', 45, 60],
      ['heavy', 60, 75],
      ['triple', 50, 70],
    ] as const) {
      const plan = planShot(v, 0, weapon, angle, power);
      const next = tanksEngine.apply(s, A, { kind: 'fire', angle, power, weapon });
      const server = view(next);
      expect(plan.terrain).toEqual(server.terrain);
      expect(plan.hp).toEqual(server.hp);
      expect(sameImpacts(plan.impacts, server.last!.impacts)).toBe(true);
      expect(plan.traces.length).toBe(weapon === 'triple' ? 3 : 1);
      for (const t of plan.traces) expect(t.length).toBeGreaterThan(2);
    }
  });

  it('plans a shot from the second player’s side too', () => {
    let s = start();
    s = tanksEngine.apply(s, A, tanksAutoAction(s));
    const v = view(s, B);
    expect(myIndex(v, B)).toBe(1);
    const plan = planShot(v, 1, 'shell', 135, 60);
    const next = tanksEngine.apply(s, B, { kind: 'fire', angle: 135, power: 60, weapon: 'shell' });
    expect(plan.terrain).toEqual(view(next, B).terrain);
  });

  it('builds the ground and health shell by shell, ending where the server does', () => {
    const s = start(9n);
    const v = view(s);
    const plan = planShot(v, 0, 'triple', 50, 70);
    expect(terrainAfter(v.terrain, 'triple', plan.impacts, 0)).toEqual(v.terrain);
    expect(terrainAfter(v.terrain, 'triple', plan.impacts, 3)).toEqual(plan.terrain);
    expect(terrainAfter(v.terrain, 'triple', plan.impacts, 99)).toEqual(plan.terrain);
    expect(hpAfter(v.hp, plan.impacts, 0)).toEqual(v.hp);
    expect(hpAfter(v.hp, plan.impacts, 3)).toEqual(plan.hp);
    const tank = [{ kind: 'tank' as const, x: 1, y: 1, damage: [0, 40] as [number, number] }];
    expect(hpAfter([100, 100], tank, 1)).toEqual([100, 60]);
  });

  it('spots a difference in impacts', () => {
    const imp = { kind: 'ground' as const, x: 1, y: 2, damage: [0, 5] as [number, number] };
    expect(sameImpacts([imp], [imp])).toBe(true);
    expect(sameImpacts([imp], [{ ...imp, x: 2 }])).toBe(false);
    expect(sameImpacts([imp], [{ ...imp, damage: [1, 5] }])).toBe(false);
    expect(sameImpacts([imp], [])).toBe(false);
  });

  it('lays shells one after the other and finds the frame', () => {
    const t1: [number, number][] = [
      [0, 0],
      [30, 30],
      [60, 0],
    ];
    const t2: [number, number][] = [
      [0, 0],
      [10, 10],
    ];
    const tl = timeline([t1, t2]);
    expect(tl.starts[0]).toBe(0);
    expect(tl.ends[0]).toBeCloseTo(2 * (1000 / 30));
    expect(tl.starts[1]).toBeGreaterThan(tl.ends[0]!);
    expect(tl.total).toBeCloseTo(tl.ends[1]!);

    const early = frameAt([t1, t2], tl, 0);
    expect(early.landed).toBe(0);
    expect(early.pos).toEqual({ x: 0, y: 0 });
    const mid = frameAt([t1, t2], tl, 1000 / 30);
    expect(mid.pos).toEqual({ x: 30, y: 30 });
    const between = frameAt([t1, t2], tl, tl.ends[0]! + 10);
    expect(between).toMatchObject({ landed: 1, pos: null });
    const end = frameAt([t1, t2], tl, tl.total + 1000);
    expect(end).toMatchObject({ landed: 2, pos: null });
    expect(timeline([]).total).toBe(0);
  });

  it('replays the other player’s shot from the result: it ends at the recorded impact', () => {
    let s = start(9n);
    s = tanksEngine.apply(s, A, { kind: 'fire', angle: 55, power: 70, weapon: 'triple' });
    const v = view(s, B);
    const traces = replayFromResult(v)!;
    expect(traces).toHaveLength(3);
    traces.forEach((tr, i) => {
      const imp = v.last!.impacts[i]!;
      const end = tr[tr.length - 1]!;
      expect(end).toEqual([imp.x, imp.y]);
    });
    expect(replayFromResult(view(start()))).toBeNull();
  });
});

describe('drawing helpers', () => {
  it('flips world y to the screen', () => {
    expect(flipY(0)).toBe(500);
    expect(flipY(500)).toBe(0);
  });

  it('draws the ground as a closed polygon with the tanks standing on it', () => {
    const v = view(start());
    const pts = terrainPoints(v.terrain).split(' ');
    expect(pts[0]).toBe('0,500');
    expect(pts).toHaveLength(200 + 4);
    expect(pts[pts.length - 1]).toBe('800,500');
    const t = tankAt(v, 0);
    expect(t.x).toBe(25 * 4 + 2);
    expect(t.y).toBe(v.terrain[25]! + 8);
  });

  it('colours health', () => {
    expect(hpColor(80)).toBe('#2BB673');
    expect(hpColor(45)).toBe('#E3A93B');
    expect(hpColor(10)).toBe('#E0455E');
  });
});

describe('lines of text', () => {
  const name = (id: string) => (id === B ? 'Zainab' : id);

  it('describes the wind', () => {
    expect(windLabel(-12)).toBe('Wind ← 12');
    expect(windLabel(3)).toBe('Wind → 3');
    expect(windLabel(0)).toBe('No wind');
    expect(windSpoken(-4)).toContain('left');
    expect(windSpoken(4)).toContain('right');
    expect(windSpoken(0)).toBe('No wind');
  });

  it('counts shots and writes the score line with you first', () => {
    const v = { ...view(start()), hp: [62, 0] as [number, number] };
    expect(shotLine(v, 0)).toBe('Shot 1 of 12');
    expect(shotLine({ ...v, shots: [12, 12] }, 0)).toBe('Shot 12 of 12');
    expect(tanksScoreLine(v, A, name)).toBe('You 62 hp · Zainab 0 hp');
    expect(tanksScoreLine(v, B, name)).toBe('You 0 hp · user-a 62 hp');
  });

  it('says what the last shot did', () => {
    const base = view(start());
    const shot = (
      by: string,
      damage: [number, number],
      kind: 'ground' | 'tank' | 'out' = 'ground',
    ) => ({
      ...base,
      last: {
        seq: 1,
        by,
        angle: 45,
        power: 50,
        weapon: 'shell' as const,
        wind: 0,
        impacts: [{ kind, x: 1, y: 1, damage }],
      },
    });
    expect(lastShotLine(base, A, name)).toBeNull();
    expect(lastShotLine(shot(A, [0, 40], 'tank'), A, name)).toBe('You hit Zainab for 40');
    expect(lastShotLine(shot(B, [40, 0], 'tank'), A, name)).toBe('Zainab hit you for 40');
    expect(lastShotLine(shot(A, [10, 0]), A, name)).toBe('You hurt yourself for 10');
    expect(lastShotLine(shot(B, [0, 10]), A, name)).toBe('Zainab hurt themselves for 10');
    expect(lastShotLine(shot(A, [5, 30], 'tank'), A, name)).toBe(
      'You hit Zainab for 30 and hurt yourself for 5',
    );
    expect(lastShotLine(shot(A, [0, 0]), A, name)).toBe('You missed');
    expect(lastShotLine(shot(B, [0, 0], 'out'), A, name)).toBe('Zainab missed the whole map');
    expect(damageText(40)).toBe('-40');
    expect(damageText(0)).toBe('');
  });
});
